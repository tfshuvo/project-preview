import { Daytona } from "@daytonaio/sdk";
import {
  VM_PORT,
  WORKDIR,
  TEMPLATE_REPO,
} from "@/lib/vars";

export type VmRuntimeMetadata = {
  vmId: string;
  previewUrl: string;
  devCommandTerminalUrl: string;
  additionalTerminalsUrl: string;
};

// Lazy singleton — only instantiated on first use (not at module load time)
// so Next.js build doesn't fail when DAYTONA_API_KEY is not set.
let _daytona: Daytona | null = null;

export const getDaytona = (): Daytona => {
  if (!_daytona) {
    _daytona = new Daytona();
  }
  return _daytona;
};

export const createVmForRepo = async (
  cloneUrl?: string,
): Promise<VmRuntimeMetadata> => {
  const finalCloneUrl = cloneUrl || TEMPLATE_REPO;
  const daytona = getDaytona();

  console.log(`[VM] Creating sandbox for ${finalCloneUrl}...`);
  
  const sandbox = await daytona.create(
    {
      language: "typescript",
      image: "node:20", 
      envVars: { 
        NODE_ENV: "development",
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
      },
      public: true,
    },
    { timeout: 600 },
  );

  const WORKDIR_PATH = "/home/node/workspace";

  console.log(`[VM] Sandbox ${sandbox.id} ready. Diagnosing environment...`);
  
  // Create workdir with correct permissions
  await sandbox.process.executeCommand(`export LC_ALL=C && mkdir -p ${WORKDIR_PATH}`);

  console.log(`[VM] Cloning repository into ${WORKDIR_PATH}...`);
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    await sandbox.git.clone(
      finalCloneUrl, 
      WORKDIR_PATH, 
      undefined, 
      undefined, 
      githubToken ? "oauth2" : undefined, 
      githubToken
    );
    console.log("[VM] Clone successful using native Git service.");
  } catch (err) {
    console.error(`[VM] Native clone failed: ${err}`);
    throw err;
  }

  // Discovery phase: Detect framework
  console.log(`[VM] Detecting framework in ${WORKDIR_PATH}...`);
  const lsResult = await sandbox.process.executeCommand(`ls -F ${WORKDIR_PATH}`);
  console.log(`[VM] Raw files found: "${lsResult.result.replace(/\n/g, ", ")}"`);
  const files = lsResult.result.split("\n").map(f => f.trim()).filter(Boolean);

  let framework = "node";
  let port = 3000;
  let installCmd = "";
  let devCmd = "";
  let executionDir = WORKDIR_PATH;

  const isHugo = files.some(f => /^(hugo|config|theme)\.(toml|yaml|json)/i.test(f));
  const hasExampleSite = files.some(f => f === "exampleSite/");
  const isAstro = files.some(f => f.startsWith("astro.config."));
  const isVite = files.some(f => f.startsWith("vite.config."));
  const isYarn = files.some(f => f === "yarn.lock");
  const isPnpm = files.some(f => f === "pnpm-lock.yaml");

  if (isHugo) {
    framework = "hugo";
    port = 1313;
    
    // If it's a theme with an exampleSite, run from there
    if (hasExampleSite && !files.some(f => /^(hugo|config)\.(toml|yaml|json)/i.test(f))) {
      console.log("[VM] Hugo theme detected. Using exampleSite for preview...");
      executionDir = `${WORKDIR_PATH}/exampleSite`;
      devCmd = `hugo server -D --bind 0.0.0.0 --port ${port} --themesDir ../.. --theme $(basename ${WORKDIR_PATH})`;
    } else {
      devCmd = `hugo server -D --bind 0.0.0.0 --port ${port}`;
    }

    console.log("[VM] Hugo detected. Ensuring hugo binary exists...");
    const hugoCheck = await sandbox.process.executeCommand("export LC_ALL=C && hugo version").catch(() => null);
    if (!hugoCheck || hugoCheck.exitCode !== 0) {
      console.log("[VM] Hugo not found. Installing official binary...");
      
      // Detect architecture
      const archResult = await sandbox.process.executeCommand("uname -m");
      const arch = archResult.result.trim() === "x86_64" ? "amd64" : "arm64";
      const hugoVersion = "0.145.0"; // Known stable version
      const hugoUrl = `https://github.com/gohugoio/hugo/releases/download/v${hugoVersion}/hugo_extended_${hugoVersion}_linux-${arch}.tar.gz`;

      console.log(`[VM] Downloading Hugo v${hugoVersion} for ${arch}...`);
      const binDir = "/home/node/bin";
      await sandbox.process.executeCommand(`mkdir -p ${binDir}`);
      await sandbox.process.executeCommand(`export LC_ALL=C && curl -L ${hugoUrl} -o /tmp/hugo.tar.gz && tar -xzf /tmp/hugo.tar.gz -C /tmp && mv /tmp/hugo ${binDir}/hugo && chmod +x ${binDir}/hugo`);
      
      // Also install useful debugging tools
      await sandbox.process.executeCommand("export LC_ALL=C && (apt-get update && apt-get install -y procps net-tools || echo 'Tools skip')").catch(() => null);
    }
    installCmd = "echo 'Hugo environment ready'";
  } else {
    // Standard Node detection
    if (isAstro) {
      framework = "astro";
      port = 4321;
      devCmd = `npm run dev`; // We will use env vars for host/port
    } else if (isVite) {
      framework = "vite";
      port = 5173;
      devCmd = `npm run dev`;
    } else {
      devCmd = "npm run dev";
    }

    if (isYarn) installCmd = "yarn install --non-interactive";
    else if (isPnpm) {
      await sandbox.process.executeCommand("npm install -g pnpm").catch(() => null);
      installCmd = "pnpm install";
    } else installCmd = "npm install";

    if (isYarn && devCmd.startsWith("npm run")) devCmd = devCmd.replace("npm run", "yarn");
    if (isPnpm && devCmd.startsWith("npm run")) devCmd = devCmd.replace("npm run", "pnpm");
  }

  const RUN_ENV = `export LC_ALL=C && export PATH=$PATH:/home/node/bin:${executionDir}/node_modules/.bin && export NODE_ENV=development && export HOST=0.0.0.0 && export PORT=${port} && export ASTRO_HOST=0.0.0.0 && export ASTRO_PORT=${port}`;

  console.log(`[VM] Framework: ${framework}, Port: ${port}, Execution Dir: ${executionDir}`);
  console.log(`[VM] Running installation: ${installCmd}`);
  const installResult = await sandbox.process.executeCommand(`cd ${executionDir} && ${RUN_ENV} && ${installCmd}`);
  console.log(`[VM] Install exit code: ${installResult.exitCode}`);
  if (installResult.exitCode !== 0) {
    console.error(`[VM] Install failed: ${installResult.result}`);
  }

  console.log(`[VM] Starting dev server: ${devCmd}`);
  void sandbox.process.executeCommand(
    `cd ${executionDir} && ${RUN_ENV} && nohup ${devCmd} > /tmp/dev-server.log 2>&1 &`,
  );

  const preview = await sandbox.getPreviewLink(port);
  console.log(`[VM] Preview URL: ${preview.url}`);

  return {
    vmId: sandbox.id,
    previewUrl: preview.url,
    devCommandTerminalUrl: "",
    additionalTerminalsUrl: "",
  };
};
