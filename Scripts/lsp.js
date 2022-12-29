const BaseLanguageServer = require("./base_language_server");
const LocalLanguageServer = require("./local_language_server");
const DockerLanguageServer = require("./docker_language_server");

class RubyLanguageServer extends BaseLanguageServer {
	constructor() {
		super();

		this.observeConfiguration("ruby.docker-compose-service");

		this.languageClient = null;
		this.start()
			.catch(ex => {
				this.logError(ex, ex.stack);
			})
	}

	get preferredExecutionMethod() {
		if (!!this.getConfig("ruby.docker-compose-service")) {
			return "docker";
		}

		return "local";
	}

	get workspaceContainsRubyGems() {
		return ["Gemfile", "gems.rb"]
			.some(file => this.workspaceContainsFile(file));
	}

	async onConfigChanged(key, newValue) {
		if (key === "ruby.docker-compose-service") {
			this.stop();
			this.start();
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
		await this.languageClient.prepare()
		await this.languageClient.start()
	}

	stop() {
		if (this.languageClient) {
			this.languageClient.deactivate();
			this.languageClient = null;
		}
	}
}

module.exports = RubyLanguageServer;
