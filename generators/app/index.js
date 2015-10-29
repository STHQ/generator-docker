/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var yosay = require('yosay');
var path = require('path');
var process = require('process');
var exec = require('child_process').exec;
var os = require('os');

// General
var projectType = "";
var error = false;

// Docker variables
var portNumber = 3000;
var imageName = "";
var dockerHostName = "default";

// Node.js variables
var addnodemon = false;
var nodemonCommand = 'RUN npm install nodemon -g';

// Golang variables
var isGoWeb = false;

function showPrompts() {
    var done = this.async();
    var prompts = [{
        type: 'list',
        name: 'type',
        message: 'What language is your project using?',
        choices: [{
            name: 'ASP.NET 5',
            value: 'aspnet'
        }, {
            name: 'Golang',
            value: 'golang'
        }, {
            name: 'Node.js',
            value: 'nodejs'
        }]
    }, {
        type: 'confirm',
        name: 'addnodemon',
        message: 'Do you want to use Nodemon?',
        when: function (answers) {
            return answers.type === 'nodejs';
        }
    }, {
        type: 'confirm',
        name: 'isGoWeb',
        message: 'Does your Go project use a web server?',
        when: function (answers) {
            return answers.type === 'golang';
        }
    }, {
        type: 'input',
        name: 'portNumber',
        message: 'Which port is your app listening to?',
        default: "3000",
        when: function (answers) {
            // Show this answer if user picked Node.js or Golang that's using a web server.
            return answers.type === 'nodejs' || (answers.type === 'golang' && answers.isGoWeb);
        }
    }, {
        type: 'input',
        name: 'imageName',
        message: 'What do you want to name your image?',
        default: process.cwd().split(path.sep).pop().toLowerCase() + '_image',
    }, {
        type: 'input',
        name: 'dockerHostName',
        message: 'What\'s the name of your docker host machine?',
        default: 'default',
    }];

    this.prompt(prompts, function (props) {
        projectType = props.type;
        addnodemon = props.addnodemon;
        portNumber = props.portNumber;
        imageName = props.imageName;
        dockerHostName = props.dockerHostName;
        isGoWeb = props.isGoWeb;

        if (projectType === 'aspnet') {
            this.log.error('Not implemented yet :(');
            return;
        }
        done();
    }.bind(this));
}

function handleNodeJs(yo) {

    var runCommand = 'CMD ["nodemon"]';
    var containerRunCommand = 'docker run -di -p $publicPort:$containerPort -v `pwd`:/src $imageName';

    if (isWindows()) {
        containerRunCommand = 'docker run -di -p %publicPort%:%containerPort% -v `pwd`:/src %imageName%';
    }

    if (!addnodemon) {
        // If we don't need nodemon, just use node and don't share the volume.
        nodemonCommand = '';
        runCommand = 'CMD ["node", "./bin/www"]';
        containerRunCommand = 'docker run -di -p $publicPort:$containerPort $imageName';

        if (isWindows()) {
            containerRunCommand = 'docker run -di -p %publicPort%:%containerPort% %imageName%';
        }
    }

    yo.fs.copyTpl(
        yo.templatePath('_Dockerfile.nodejs'),
        yo.destinationPath('Dockerfile'), {
            imageName: 'node',
            nodemonCommand: nodemonCommand,
            portNumber: portNumber,
            runCommand: runCommand
        });

    yo.fs.copyTpl(
        yo.templatePath(getNodeJsTemplateScriptName()),
        yo.destinationPath(getDestinationScriptName()), {
            imageName: imageName,
            portNumber: portNumber,
            dockerHostName: dockerHostName,
            containerRunCommand: containerRunCommand
        });
}

function handleGolang(yo) {

    var openWebSiteCommand = "";
    var runImageCommand = "docker run -di " + imageName;

    if (isGoWeb) {
        openWebSiteCommand = "open \"http://$(docker-machine ip $dockerHostName):" + portNumber + "\"";
        runImageCommand = "docker run -di -p " + portNumber + ":" + portNumber + " " + imageName;

        if (isWindows()) {
            openWebSiteCommand = 'set ip="docker-machine ip %dockerHostName%" & start %ip%:%publicPort%';
        }
    }

    yo.fs.copyTpl(
        yo.templatePath('_Dockerfile.golang'),
        yo.destinationPath('Dockerfile'), {
            imageName: 'golang',
            // Use current folder name as project name.
            projectName: process.cwd().split(path.sep).pop()
        });

    yo.fs.copyTpl(
        yo.templatePath(getGolangTemplateScriptName()),
        yo.destinationPath(getDestinationScriptName()), {
            imageName: imageName,
            runImageCommand: runImageCommand,
            openWebSiteCommand: openWebSiteCommand,
            dockerHostName: dockerHostName
        });
}

function end() {
    if (error) {
        this.log(chalk.red(':( errors occured.'));
    }

    var done = this.async();
    if (!isWindows()) {
        exec('chmod +x ' + getDestinationScriptName(), function (err) {
            if (err) {
                this.log.error(err);
                this.log.error('Error making script executable. Run ' + chalk.bold('chmod +x ' + getDestinationScriptName()) + ' manually.');
                error = true;
            }
            done();
        }.bind(this));
    }
    this.log('Your project is now ready to run in a Docker container!');
    this.log('Run ' + chalk.green(getDestinationScriptName()) + ' to build a Docker image and run your app in a container.');

}

function isWindows() {
    return os.platform() === 'win32';
}

function getDestinationScriptName() {
    return isWindows() ? 'dockerTask.cmd' : 'dockerTask.sh';
}

function getNodeJsTemplateScriptName() {
    return isWindows() ? '_dockerTaskNodejs.cmd' : '_dockerTaskNodejs.sh';
}

function getGolangTemplateScriptName() {
    return isWindows() ? '_dockerTaskGolang.cmd' : '_dockerTaskGolang.sh';
}

// Docker Generator.
var DockerGenerator = yeoman.generators.Base.extend({
    constructor: function () {
        yeoman.generators.Base.apply(this, arguments);
    },

    init: function () {
        this.log(yosay('Welcome to the ' + chalk.red('Docker') + ' generator!' + chalk.green('\nLet\'s add Docker container magic to your app!')));
    },

    askFor: showPrompts,
    writing: function () {
        this.sourceRoot(path.join(__dirname, './templates'));
        switch (projectType) {
            case 'nodejs':
                {
                    handleNodeJs(this);
                    break;
                }
            case 'golang':
                {
                    handleGolang(this);
                    break;
                }
            default:
                this.log.error(':( not implemented.');
                break;
        }
    },
    end: end
});

module.exports = DockerGenerator;