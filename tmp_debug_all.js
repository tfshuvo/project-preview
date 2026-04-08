const connectToDatabase = require("./lib/db").default;
const { RepoMetadataModel } = require("./lib/models/repo");
const { Daytona } = require("@daytonaio/sdk");

async function debugAll() {
  await connectToDatabase();
  const repos = await RepoMetadataModel.find({ name: /astro|hugo/i }).sort({ createdAt: -1 }).limit(5);
  console.log(`Found ${repos.length} candidates for debugging.`);

  const daytona = new Daytona();

  for (const repo of repos) {
    console.log(`\n=== Debugging Repo: ${repo.name} (${repo.vm.vmId}) ===`);
    try {
      const sandbox = await daytona.get(repo.vm.vmId);
      
      console.log("[Logs] /tmp/dev-server.log:");
      const logs = await sandbox.process.executeCommand("cat /tmp/dev-server.log").catch(e => ({ result: "No log file found" }));
      console.log(logs.result);

      console.log("\n[Processes]:");
      const ps = await sandbox.process.executeCommand("ps aux | grep -v grep").catch(e => ({ result: "ps failed" }));
      console.log(ps.result);

      console.log("\n[Network]:");
      const net = await sandbox.process.executeCommand("ls -l /proc/net/tcp").catch(e => ({ result: "no /proc/net/tcp" }));
      // We'll use a more compatible way to check listening ports
      const listen = await sandbox.process.executeCommand("ss -tulpn || netstat -tupln || echo 'No net tools available'").catch(e => ({ result: "net check failed" }));
      console.log(listen.result);

      console.log("\n[Filesystem] WORKDIR contents:");
      const ls = await sandbox.process.executeCommand("ls -F /home/node/workspace").catch(e => ({ result: "ls failed" }));
      console.log(ls.result);

    } catch (err) {
      console.error(`Failed to debug ${repo.vm.vmId}: ${err.message}`);
    }
  }
  process.exit(0);
}

debugAll();
