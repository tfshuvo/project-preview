import connectToDatabase from "./lib/db";
import { RepoMetadataModel } from "./lib/models/repo";
import { getDaytona } from "./lib/adorable-vm";

async function debugSandbox() {
  await connectToDatabase();
  const repo = await RepoMetadataModel.findOne({ name: /astroplate|astro/i }).sort({ createdAt: -1 });
  if (!repo) {
    console.error("No Astro repo found.");
    process.exit(1);
  }

  const vmId = repo.vm.vmId;
  const daytona = getDaytona();
  console.log(`Checking sandbox ${vmId}...`);
  const sandbox = await daytona.get(vmId);

  console.log("--- Dev Server Log (/tmp/dev-server.log) ---");
  const logResult = await sandbox.process.executeCommand("cat /tmp/dev-server.log");
  console.log(logResult.result);

  console.log("\n--- Process Check (ps aux) ---");
  const psResult = await sandbox.process.executeCommand("ps aux | grep hugo");
  console.log(psResult.result);

  console.log("\n--- Network Check (netstat) ---");
  const netResult = await sandbox.process.executeCommand("netstat -tupln | grep 1313").catch(() => ({ result: "netstat not found" }));
  console.log(netResult.result);

  process.exit(0);
}

debugSandbox().catch(err => {
  console.error(err);
  process.exit(1);
});
