class BaseLanguageServer {
    constructor() {
        this.__localSettingsCache = {};
        this.observedConfigurationKeys = [];

        // Observe the configuration setting for the server's location, and
        // restart the server on change.
        this.toObserve = {
            "ruby.language-server-path": "global",

            "ruby.docker-compose-service": "workspace",
            "ruby.docker-compose-mount-path": "workspace",
            "ruby.docker-executable-path": "workspace",
            "ruby.docker-compose-shell": "workspace",
            "ruby.docker-compose-try-bundle": "workspace",
        };

        this.configurationListeners = Object.keys(this.toObserve).map((configKey) => {
            let config = this.toObserve[configKey] == "workspace" ? nova.workspace.config : nova.config;

            return config.onDidChange(configKey, (newValue) => {
                if (this.__localSettingsCache[configKey] == newValue) {
                    return;
                }
                this.__localSettingsCache[configKey] = newValue;

                if (this.observedConfigurationKeys.includes(configKey)) {
                    this.onConfigChanged(configKey, newValue)
                        .catch(ex => this.logError(ex, ex.stack));
                }
            })
        });
    }

    async prepare() {}

    getConfig(key) {
        let config = this.toObserve[key] == "workspace" ? nova.workspace.config : nova.config;
        return config.get(key);
    }

    observeConfiguration(...name) {
        this.observedConfigurationKeys.push(...name);
    }

    workspaceContainsFile(named) {
        return nova.workspace.contains(this.workspaceFilePath(named));
    }

    workspaceFilePath(...components) {
        return nova.path.join(nova.workspace.path, ...components);
    }

    runProcess(command, ...args) {
        this.log("runProcess is invoking ", [command, ...args].map(i => `"${i}"`).join(" "))
        return new Promise(resolve => {
            let result = {
                command: command,
                args: args,
                success: false,
                stdout: "",
                stderr: "",
            };

            const process = new Process(command, {
                args: args,
                cwd: nova.workspace.path,
                shell: true,
            });

            process.onStdout(line => result.stdout += line);
            process.onStderr(line => result.stderr += line);
            process.onDidExit(status => {
                result.success = status === 0;
                resolve(result);
            });

            process.start();
        });
    }

    logError(...args) {
        if (!nova.inDevMode()) return;

        console.error(...args);
    }

    log(...args) {
        if (!nova.inDevMode()) return;

        console.log(...args);
    }

    async onConfigChanged(key, newValue) {}

    notifyUser(kind, title, body, helpAction) {
        const request = new NotificationRequest("kind");
        request.title = nova.localize(title);
        request.body = nova.localize(body);
        let actions = [nova.localize("OK")];
        if (!!helpAction) {
            actions.push(nova.localize("Help"));
        }
        request.actions = actions;


        return nova.notifications.add(request)
            .then((response) => {
                if (response.actionIdx == 1) {
                    return helpAction();
                }

                return true;
            })
            .catch((error) => this.logError(error, error.stack))
    }

    openWorkspaceConfig() {
        nova.workspace.openConfig('tdegrunt.Ruby');
    }

    deactivate() {
        this.log(`${this.constructor.name}: Deactivate called.`)
        this.log(`${this.constructor.name}: Calling stop.`)
        this.stop();

        this.configurationListeners.forEach(listener => {
            listener.dispose()
        });
        this.configurationListeners = [];
    }
}

module.exports = BaseLanguageServer;
