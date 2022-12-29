class BaseLanguageServer {
    workspaceContainsFile(named) {
        return nova.workspace.contains(this.workspaceFilePath(named));
    }

    workspaceFilePath(...components) {
        return nova.path.join(nova.workspace.path, ...components);
    }

    runProcess(command, ...args) {
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

    onConfigChanged(key, newValue) {}

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
}

module.exports = BaseLanguageServer;
