const BaseLanguageServer = require("./base_language_server");

// LocalLanguageServer executes Solargraph directly on the host machine.
class LocalLanguageServer extends BaseLanguageServer {
    constructor() {
        super();
        this.languageClient = null;
        this.langServerPath = null;
        this.observeConfiguration("ruby.language-server-path");
    }

    async onConfigChanged(key, newValue) {
        this.log("Received onConfigChanged");
        if (this.observedConfigurationKeys.includes(key)) {
            if (this.langServerPath == newValue) { return; }
            this.langServerPath = newValue;

            this.log("Restarting server...");
            this.start().catch(ex => this.error(ex, ex.stack))
        }
    }

    get globalPath() {
        if (typeof this._globalPath !== "undefined") {
          return Promise.resolve(this._globalPath);
        }

        return this.runProcess("which", "solargraph")
            .then(result => {
                if (!result.success) {
                    return this._globalPath = false;
                }

                return this.runProcess(result.stdout.trim(), "--version")
            })
            .then(result => {
                if (!result.success) {
                    this._globalPath = false
                    return false;
                }

                this._globalPath = result.command;
                return this._globalPath;
            });
    }

    async commandArgs(commandArguments) {
        let args = [];
        let pathFromConfig = this.getConfig('ruby.language-server-path');
        if (!this.langServerPath) {
            this.langServerPath = pathFromConfig;
        }

        if (!!pathFromConfig) {
            args.push(pathFromConfig);
        } else if (await this.isBundled) {
            this.log("isBundled");
            args.push(
                this.workspaceFilePath("bin", "bundle"),
                "exec", "solargraph");
        } else if (await this.globalPath) {
            this.log("globalPath");
            args.push(await this.globalPath);
        } else {
            return false;
        }

        args.push(...commandArguments);
        this.log("Returning args", args);
        return args;
    }

    get isBundled() {
        if (typeof this._isBundled !== "undefined") {
            return Promise.resolve(this._isBundled);
        }

        return this.runProcess("bundle", "exec", "solargraph", "--version")
            .then(result => {
                if (!result.success) {
                    return this._isBundled = false;
                }

                this.log(`Found Solargraph ${result.stdout.trim()} (Bundled)`);
                return this._isBundled = true;
            })
    }

    noSolargraph() {
        if (this.notified) return;

        this.notifyUser(
            "solagraph-not-found",
            "Solargraph Not Found",
            `The "solargraph" command could not be found in your environment.`,
            () => nova.openConfig()
        )
        .finally(() => { this.notified = true });
    }

    stop() {
        this.log(`${this.constructor.name} is stopping...`);
        if (this.languageClient) {
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
            this.languageClient = null;
        }
    }

    async start() {
        if (this.languageClient) {
            this.languageClient.stop();
        }

        const defaultArguments = ["stdio"];
        const allArgs = await this.commandArgs(defaultArguments);
        if (!allArgs) {
            this.noSolargraph();
            return;
        }

        this.log("Starting server with args", allArgs);
        // Create the client
        var serverOptions = {
            path: allArgs.shift(),
            args: allArgs
        };
        var clientOptions = {
            // The set of document syntaxes for which the server is valid
            syntaxes: ['ruby']
        };
        var client = new LanguageClient('ruby', 'Ruby Language Server', serverOptions, clientOptions);

        try {
            // Start the client
            client.start();

            // Add the client to the subscriptions to be cleaned up
            nova.subscriptions.add(client);
            this.languageClient = client;
            this.log("Now running Solargraph (local)")
        }
        catch (err) {
            // If the .start() method throws, it's likely because the path to the language server is invalid
            this.logError(err);
        }
    }
}

module.exports = LocalLanguageServer;
