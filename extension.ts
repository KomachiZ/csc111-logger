import * as vscode from 'vscode';
import ActionLogger from './ActionLogger';
import * as fs from 'fs';
import * as path from 'path';
import { create } from 'domain';
import * as http from 'http'; 
import { exec } from 'child_process';
export async function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "csc111" is now active!');
	async function validateAndCacheUsername(userId: string) {
		const postData = JSON.stringify({ username: userId });
		const options = {
			hostname: '', //update here
			port: 5000, 
			path: '/validate_user', 
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(postData),
			},
		};
	
		return new Promise<void>((resolve, reject) => {
			const req = http.request(options, (res) => {
				if (res.statusCode === 200) {
					console.log('User validated');
					cacheUsername(userId).then(resolve).catch(reject);
				} else {
					vscode.window.showWarningMessage("Invalid User ID.");
					reject();
				}
			});
	
			req.on('error', (e) => {
				console.error(`Problem with request: ${e.message}`);
				reject();
			});
	
			req.write(postData);
			req.end();
		});
	}


	
	const USERNAME_CACHE_FILE = path.join(context.globalStoragePath, '.usernameCache.json');
	console.log(USERNAME_CACHE_FILE);
	async function getCachedUsername(): Promise<string | undefined> {
      
        if (!fs.existsSync(context.globalStoragePath)) {
            fs.mkdirSync(context.globalStoragePath, { recursive: true });
        }

        try {
            if (fs.existsSync(USERNAME_CACHE_FILE)) {
                const data = fs.readFileSync(USERNAME_CACHE_FILE, 'utf8');
                const cache = JSON.parse(data);
                return cache.username;
            }
        } catch (error) {
            console.error('Error reading username cache:', error);
        }
        return undefined;
    }

    async function cacheUsername(username: string): Promise<void> {
        try {
            fs.writeFileSync(USERNAME_CACHE_FILE, JSON.stringify({ username }), 'utf8');
        } catch (error) {
            console.error('Error writing username cache:', error);
        }
    }
	let userId = await getCachedUsername();
    let attempts = 0;
	while (!userId && attempts < 3) { 
        userId = await vscode.window.showInputBox({
            prompt: "Please enter your User ID",
            placeHolder: "User ID",
        });

        if (userId) {
            try {
                await validateAndCacheUsername(userId);
                break; 
            } catch (error) {
				console.error('Error validateAndCacheUsername:', error);
                vscode.window.showWarningMessage("Failed to validate User ID. Please try again.");
                userId = undefined; 
            }
        } else {
            vscode.window.showWarningMessage("User ID is required for logging.");
            break; 
        }

        attempts++; 
    }

    if (!userId) { 
        vscode.window.showErrorMessage("Invalid User ID after 3 attempts. Please contact the administrator.");
        return; 
    }
   

	const logger = new ActionLogger(
		context,
		"base", // Topic for the logger 
		"http:127.0.0.1/log", // update Backend server URL
		['openDocument', 'startDebugSession', 'endDebugSession', 'endTaskProcess','saveDocument','terminalOpened','terminalClosed','terminalActiveChanged','diagnosticsChanged','textDocumentChanged'], // Actions to monitor
		userId
	);
	async function fetchTemplateFromServer(fileName: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const options = {
				hostname: '',//update here
				port: 5000,
				path: `/template/${fileName}`,
				method: 'GET'
			};
	
			const req = http.request(options, (res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => {
					chunks.push(chunk);
				});
				res.on('end', () => {
					if (res.statusCode === 200) {
						const buffer = Buffer.concat(chunks);
						resolve(buffer);
					} else {
						reject(new Error(`Failed to fetch template: ${res.statusCode}`));
					}
				});
			});
	
			req.on('error', (error) => {
				reject(error);
			});
	
			req.end();
		});
	}
	const statusBarButtonItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 601);
	statusBarButtonItem.text = `$(play) Download Templates`;
	statusBarButtonItem.tooltip = 'Download Templates';
	statusBarButtonItem.command = 'extension.downloadPythonTemplates';
	statusBarButtonItem.show();

	const disposableCommand = vscode.commands.registerCommand('extension.downloadPythonTemplates', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage("Please open a workspace to download the templates.");
			return;
		}
	
		const fileStructure = {
			'templates':['CSC111_design_file_template.docx','CSC111_test_plan_template.docx','CSC111_Python_source_file_template.py'],
			'week1': ['helloworld.py', 'helloworld_notebook.ipynb','matplotlib_numpy_scipy_pandas_test.ipynb'],
			'week2': ['homework2.py', 'inlab2.py'],
			'week3': ['homework3.py', 'inlab3.py'],
			'week4': ['homework4.py', 'inlab4.py'],
			'week5': ['homework5.py', 'inlab5.py'],
			'week6': ['homework6.py', 'inlab6.py'],
			'week7': ['homework7.py', 'inlab7.py'],
			'week8': ['homework8.py', 'inlab8.py'],
			'week9': ['homework9.py', 'inlab9.py'],
			'week10': ['homework10.py', 'inlab10.py'],
			'week11': ['homework11.py', 'inlab11.py'],
			'week12': ['homework12.py', 'inlab12.py'],
			'week13': ['homework13.py', 'inlab13.py'],
			'project1':[],
			'project2':[],
			'project3':[]
		};
	
		const targetFolder = path.join(workspaceFolders[0].uri.fsPath, 'csc111');
		
		try {
			if (!fs.existsSync(targetFolder)) {
				fs.mkdirSync(targetFolder);
			}
	
			let createdFiles = 0;
			for (const [weekFolder, files] of Object.entries(fileStructure)) {
				const weekPath = weekFolder ? path.join(targetFolder, weekFolder) : targetFolder;
				
				if (weekFolder && !fs.existsSync(weekPath)) {
					fs.mkdirSync(weekPath);
				}
	
				for (const fileName of files) {
					const targetFilePath = path.join(weekPath, fileName);
					if (!fs.existsSync(targetFilePath)) {
						try {
							const fileContent = await fetchTemplateFromServer(fileName);
							if (fileName.endsWith('.ipynb')) {
								const jsonContent = JSON.parse(fileContent.toString());
								fs.writeFileSync(targetFilePath, JSON.stringify(jsonContent, null, 2));
							} else {
								// Write binary content for all files
								fs.writeFileSync(targetFilePath, fileContent);
							}
							createdFiles++;
						} catch (error) {
							console.error(`Error fetching ${fileName}:`, error);
							vscode.window.showErrorMessage(`Failed to download ${fileName}`);
						}
					}
				}
			}
	
			if (createdFiles > 0) {
				vscode.window.showInformationMessage(`${createdFiles} CSC111 files have been created successfully in their respective week folders!`);
			} else {
				vscode.window.showInformationMessage('No new files needed to be created.');
			}

			logger.logAction('user_create_template', { create_number: createdFiles});
		} catch (error) {
			vscode.window.showErrorMessage(`Error creating files: ${error}`);
		}
	});

	const installExtensionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	installExtensionButton.text = `$(cloud-download) MyTheme`;
	installExtensionButton.tooltip = 'troulette Extension'; // 
	installExtensionButton.command = 'extension.troulette'; //update this name ->publisher.extensionname
	installExtensionButton.show();

	function getCurrentTheme(): string {
        const config = vscode.workspace.getConfiguration('workbench');
        return config.get('colorTheme') || 'Unknown';
    }


	const themeRecCommand = vscode.commands.registerCommand('extension.troulette', async () => { //update here extension.extensionname
        const extensionId = 'Troulette.troulette'; //update here:publisher.extensionname
        const extension = vscode.extensions.getExtension(extensionId);
        const currentDate = new Date();
        const targetDate = new Date('2024-10-09');

        if (currentDate < targetDate) {
            // Before Oct. 9, 2024: Show current theme
            const currentTheme = getCurrentTheme();
            vscode.window.showInformationMessage(`Current VSCode theme: ${currentTheme}`);
        } else {
            // After Oct. 9, 2024: Install or show extension installed message
            if (!extension) {
                // Extension not installed, install it
                await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
                vscode.window.showInformationMessage('Troulette has been installed.');
            } else {
                // Extension already installed, show current theme
                const currentTheme = getCurrentTheme();
                vscode.window.showInformationMessage(`Current VSCode theme: ${currentTheme}`);
            }
        }
    });

	const installPackagesButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 600);
    installPackagesButton.text = `$(package) Install Python Packages`;
    installPackagesButton.tooltip = 'Install matplotlib, numpy, and scipy';
    installPackagesButton.command = 'extension.installPythonPackages';
    installPackagesButton.show();
	// Command to install Python packages
	const installPackagesCommand = vscode.commands.registerCommand('extension.installPythonPackages', async () => {
        // Check if Python extension is installed and activated
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (!pythonExtension) {
            vscode.window.showErrorMessage('Please install and enable the Python extension for VSCode first.');
            return;
        }

        if (!pythonExtension.isActive) {
            await pythonExtension.activate();
        }

        const pythonApi = pythonExtension.exports;

        try {
            // Get the active Python environment path
            const activeInterpreter = await pythonApi.environments.getActiveEnvironmentPath();

            if (!activeInterpreter || !activeInterpreter.path) {
                vscode.window.showErrorMessage('No active Python interpreter found. Please select a Python interpreter in VSCode.');
                return;
            }

            const pythonPath = activeInterpreter.path;

            // Proceed with package installation
            await installPackages(pythonPath);

        } catch (error) {
            console.error('Error getting Python interpreter:', error);
            vscode.window.showErrorMessage('Failed to get Python interpreter. Please make sure the Python extension is properly configured.');
        }
    });

    async function installPackages(pythonPath: string) {
		// Check if Python is installed
		exec(`${pythonPath} --version`, (error, stdout, stderr) => {
			if (error) {
				vscode.window.showErrorMessage('Selected Python interpreter is not valid. Please choose a different one.');
				return;
			}
	
			// Python is installed, proceed with package installation
			const terminal = vscode.window.createTerminal('Package Installer');
			terminal.show();
	
			const packages = ['matplotlib', 'numpy', 'scipy','pandas'];
			
			vscode.window.showInformationMessage(`Installing packages: ${packages.join(', ')} using Python at ${pythonPath}. This may take a few minutes.`);
	
			for (const pkg of packages) {
				terminal.sendText(`${pythonPath} -m pip install ${pkg}`);
			}
	
			terminal.sendText(`${pythonPath} -c "import matplotlib, numpy, scipy, pandas; print('Packages installed successfully!')" || echo "Failed to import packages. Please check the installation output."`);
	
			// Log the action
			logger.logAction('install_python_packages', { packages: packages.join(', '), pythonPath });
		});
	}
    


    context.subscriptions.push(installPackagesButton, installPackagesCommand);
    context.subscriptions.push(installExtensionButton, themeRecCommand);

	context.subscriptions.push(statusBarButtonItem);	
	context.subscriptions.push(disposableCommand);

	context.subscriptions.push(logger);
	
    
}

export function deactivate() {}