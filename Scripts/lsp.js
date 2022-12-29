const BaseLanguageServer = require("./base_language_server");
const LocalLanguageServer = require("./local_language_server");
const DockerLanguageServer = require("./docker_language_server");

class RubyLanguageServer extends BaseLanguageServer {
	constructor() {
		super();

		// Observe the configuration setting for the server's location, and
		// restart the server on change.
		const toObserve = [
			"ruby.language-server-path",
			"ruby.docker-compose-service",
			"ruby.docker-compose-mount-path",
			"ruby.docker-executable-path",
		];

		this.languageClient = null;

		this.configurationListeners = toObserve.map((configKey) =>
			nova.config.onDidChange(configKey, (newValue) =>
				this.onConfigChanged(configKey, newValue)
			)
		);

		this.start()
			.catch(ex => {
				this.logError(ex, ex.stack);
			})
	}

	get preferredExecutionMethod() {
		if (!!nova.config.get("ruby.docker-compose-service")) {
			return "docker";
		}

		return "local";
	}

	get workspaceContainsRubyGems() {
		return ["Gemfile", "gems.rb"]
			.some(file => this.workspaceContainsFile(file));
	}

	deactivate() {
		this.configurationListeners.forEach(listener => {
			listener.dispose()
		})
		this.stop();
	}

	onConfigChanged(key, newValue) {
		this.log("Configuration changed: ", key, newValue);
		if (this.languageClient) {
			this.languageClient.onConfigChanged(key, newValue);
		}
	}

	async start() {
		if (!this.workspaceContainsRubyGems) {
			this.log("No Gemfile or gems.rb. Will not start.")
			return;
		}

		if (this.languageClient) {
			this.languageClient.stop();
		}

		if (this.preferredExecutionMethod == 'local') {
			this.languageClient = new LocalLanguageServer();
		} else {
			this.languageClient = new DockerLanguageServer();
		}

		this.log(`Starting language server ${this.languageClient.constructor.name}`);

		await this.languageClient.start()
	}

	async stop() {
		if (this.languageClient) {
			await this.languageClient.stop();
			this.languageClient = null;
		}
	}
}

module.exports = RubyLanguageServer;
