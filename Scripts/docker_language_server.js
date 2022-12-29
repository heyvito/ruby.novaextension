const BaseLanguageServer = require("./base_language_server");

// DockerLanguageServer executes Solargraph on a Docker Container backed by
// docker compose.
class DockerLanguageServer extends BaseLanguageServer {
    constructor() {
        super();
        this.languageClient = null;
        this.state = null;

        this.configKeysToLocals = {
            "ruby.docker-compose-service": "composeServiceName",
            "ruby.docker-compose-mount-path": "composeMountPath",
            "ruby.docker-executable-path": "dockerExecutablePath",

            "ruby.docker-compose-shell": "composeShell",
            "ruby.docker-compose-try-bundle": "tryBundleOnStart"
        };
        this.configChangeBehaviour = {
            "ruby.docker-compose-service": "restart",
            "ruby.docker-compose-mount-path": "restartClient",
            "ruby.docker-executable-path": "restart",

            "ruby.docker-compose-shell": "restartClient",
            "ruby.docker-compose-try-bundle": "restartClient"
        }
        this.containerID = null;
        this.dockerPath = null;

        Object.keys(this.configKeysToLocals).forEach((k) => {
           this[this.configKeysToLocals[k]] = this.getConfig(k);
           this.observeConfiguration(k);
        });
    }

    async prepare() {
        await this.preloadDockerPath();
    }

    async preloadDockerPath() {
        this.dockerPath = await this.getDockerPath()
    }

    async onConfigChanged(key, newValue) {
        this[this.configKeysToLocals[key]] = newValue;
        if (key === "ruby.docker-executable-path") {
            await preloadDockerPath();
        }

        switch (this.configChangeBehaviour[key]) {
        case "restart":
            this.restart();
            break;
        case "restartClient":
            this.restartClient();
            break;
        default:
            this.logError("Cannot respond to configChangeBehaviour for key", key);
            return;
        }
    }

    async restart() {
        this.state = "restarting";
        await this.stopClient();
        await this.stopContainer();
        this.start();
    }

    async restartClient() {
        if (this.state === "restarting") return;
        await this.stopClient();
        await this.startClient();
    }

    stopClient() {
        if (this.languageClient) {
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
            this.languageClient = null;
        }
    }

    async stopContainer() {
        this.log("StopContainer called.")
        if (!this.containerID) return;
        this.log("containerID is there.")

        if (!this.dockerPath) { return }

        this.log(`Stopping container ${this.containerID}`)
        try {
            const result = await this.runProcess(dockerPath, 'rm', '-f', this.containerID);
            if (!result.success) {
                this.logError("Stopping container failed: ", result.stdout, result.stderr);
            }
        } catch(ex) {
            this.logError("Stopping container failed: ", ex, ex.stack);
        }

        this.containerID = null;
    }

    async startContainer() {
        let dockerArgs = ["compose", "run", "--rm", "-d"];

        if (!!this.composeMountPath) {
            dockerArgs.push("-w", this.composeMountPath);
        }

        let containerCommand = "sleep infinity";
        if (!!this.tryBundleOnStart) {
            containerCommand = "( bundle check || bundle install ); " + containerCommand;
        }

        dockerArgs.push(this.composeServiceName, this.composeShell, "-c", containerCommand);

        if (!this.dockerPath) return false;

        let result = await this.runProcess(this.dockerPath, ...dockerArgs);

        if (!result.success) {
            this.notifyContainerStartFailed(result.stdout + "\n" + result.stderr)
            return false;
        }

        this.containerID = result.stdout.trim();
        return true;
    }

    async startClient() {
        if (this.containerID == null) {
            return;
        }

        if (this.languageClient) {
            this.languageClient.stop();
        }

        if (!this.dockerPath) return;

        let serverArguments = ["exec"]

        if (!!this.composeMountPath) {
            serverArguments.push("-w", this.composeMountPath);
        }

        serverArguments.push("-i", this.containerID, this.composeShell, "-c")

        const whichArgs = [...serverArguments, "which solargraph"];
        let whichResult = await this.runProcess(this.dockerPath, ...whichArgs)

        const bundleInfoArgs = [...serverArguments, "bundle info solargraph"];
        let bundleResult = await this.runProcess(this.dockerPath, ...bundleInfoArgs)

        if (!whichResult.success && !bundleResult.success) {
            this.notifyNoSolargraphInContainer();
            return;
        }

        this.log("Starting server with args", serverArguments);
        // Create the client
        var serverOptions = {
            path: this.dockerPath,
            args: [...serverArguments, "bundle exec solargraph stdio"],
        };
        var clientOptions = {
            // The set of document syntaxes for which the server is valid
            syntaxes: ['ruby']
        };
        var client = new LanguageClient('ruby', 'Ruby Language Server', serverOptions, clientOptions);
        this.state = "running";

        try {
            // Start the client
            client.start();

            // Add the client to the subscriptions to be cleaned up
            nova.subscriptions.add(client);
            this.languageClient = client;
            this.log("Now running Solargraph (docker)")
        } catch (err) {
            // If the .start() method throws, it's likely because the path to the language server is invalid
            this.logError(err);
        }
    }

    async getDockerPath() {
        if (!!this.dockerExecutablePath) {
            const path = this.dockerExecutablePath;
            const result = await this.runProcess("stat", path)
            if (!result.success) {
                this.notifyCustomDockerExecNotFound();
                return null;
            }

            return this.dockerExecutablePath;
        }

        const result = await this.runProcess("which", "docker")
        if (!result.success) {
            this.notifySystemDockerExecNotFound();
            return null;
        }
        return result.stdout.trim();
    }

    notifyCustomDockerExecNotFound() {
        if (this.notifiedCustomDockerExec) return;

        this.notifyUser(
            "custom-docker-not-found",
            "Docker Not Found",
            `The "docker" you specified could not be found.`,
            () => this.openWorkspaceConfig()
        )
        .finally(() => { this.notifiedCustomDockerExec = true });
    }

    notifySystemDockerExecNotFound() {
        if (this.notifiedSystemDockerExec) return;

        this.notifyUser(
            "system-docker-not-found",
            "Docker Not Found",
            `The "docker" command could not be found on your environment.`,
            () => this.openWorkspaceConfig()
        )
        .finally(() => { this.notifiedSystemDockerExec = true });
    }

    notifySystemDockerExecNotFound() {
        if (this.notifiedSystemDockerExec) return;

        this.notifyUser(
            "system-docker-not-found",
            "Docker Not Found",
            `The "docker" command could not be found on your environment.`,
            () => this.openWorkspaceConfig()
        )
        .finally(() => { this.notifiedSystemDockerExec = true });
    }

    notifyContainerStartFailed(why) {
        if (this.notifiedContainerStartFailure) return;

        this.notifyUser(
            "container-start-failure",
            "Container Startup Failure",
            `The service container could not be started. Click Help for more info.`,
            () => nova.workspace.showErrorMessage("The following error prevented the container from starting: " + why)
        )
        .finally(() => { this.notifiedContainerStartFailure = true });
    }

    notifyNoSolargraphInContainer() {
        if (this.notifiedNoSolargraph) return;

        this.notifyUser(
            "solargraph-not-found-on-container",
            "Solargraph Not Found",
            `Couldn't find a "solargraph" command on your service container. Is it installed?`,
        )
        .finally(() => { this.notifiedNoSolargraph = true });
    }

    killContainer() {
        if (!this.containerID) return;
        if (!this.dockerPath) return;

        const process = new Process(this.dockerPath, {
            args: ["rm", "-f", this.containerID],
            cwd: nova.workspace.path,
            shell: true,
        });

        process.start()
    }

    stop() {
        this.log(`${this.constructor.name} is stopping...`);
        this.killContainer()
        this.stopClient();
    }

    async start() {
        await this.startContainer();
        await this.startClient();
    }
}

module.exports = DockerLanguageServer;
