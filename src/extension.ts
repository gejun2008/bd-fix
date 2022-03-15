// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { readFileSync, existsSync, writeFileSync } from "fs";

import * as cp from "child_process";

function getDevDependenciesStr() {
  let str = `#!/bin/bash 

	dev_dependencies_module_list=()
	function get_module_list_from_package(){ 
		input="./package.json" 
		local count=0 
		while IFS= read -r line 
		do 
			if [[ ("$line" == *"devDependencies"*) && ("$line" != *"{}"*) ]]; then 
				count=1 
			else 
				lint_content_trim="$line" 
	
				if [[ ( $lint_content_trim == *"}"* ) && ( $count > 0 ) ]]; then 
					count=0 
				fi 
				
				if [[ $count > 0 ]]; then 
				
					module_name=$(echo $lint_content_trim | grep -P '^"(?:@?\w+-?\/?\w+)+"' -o) 
					if [ -n "$module_name" ]; then 
						module_name=$(echo $module_name| cut -d'"' -f 2) 
						dev_dependencies_module_list+=($module_name) 
					fi 
				fi 
			fi 
		done < "$input" 
	} 

	function npm_remove_dev_dependencies(){`;
  str += '\n\t\tfor module_name in "${dev_dependencies_module_list[@]}"';
  str += `	
		do 
			npm uninstall $module_name 
		done
	}
	
	get_module_list_from_package 
	npm_remove_dev_dependencies
	`;
  return str;
}

function register(
  context: vscode.ExtensionContext,
  callback: (...args: any[]) => any,
  commandName: string
) {
  const disposable = vscode.commands.registerCommand(commandName, callback);
  context.subscriptions.push(disposable);
}

function stringToUint8Array(str: string) {
  var arr = [];
  for (var i = 0, j = str.length; i < j; ++i) {
    arr.push(str.charCodeAt(i));
  }

  var tmpUint8Array = new Uint8Array(arr);
  return tmpUint8Array;
}

async function checkScriptFile() {
  const rootPath = vscode.workspace.rootPath;
  const isScriptFileExist = existsSync(
    rootPath + "//script//remove-devDependencies.sh"
  );
  if (isScriptFileExist) {
    return true;
  }
  return copyShellFile();
}

async function copyShellFile() {
  const spaceFolder = vscode.workspace.workspaceFolders;
  if (!spaceFolder) {
    vscode.window.showErrorMessage("Please open folder firstly");
  }

  const wsPath = spaceFolder ? spaceFolder[0].uri.fsPath : null; // gets the path of the first workspace folder
  const filePath = vscode.Uri.file(
    wsPath + "/script/remove-devDependencies.sh"
  );

  const removeDepContent = getDevDependenciesStr();
  await vscode.workspace.fs.writeFile(
    filePath,
    stringToUint8Array(removeDepContent)
  );
  return true;
}

async function updateJenkins(jenkinsContent: string) {
  const rootPath = vscode.workspace.rootPath;

  // Setup done, return directly
  if (jenkinsContent.includes("script/remove-devDependencies.sh")) {
    return false;
  }

  const tsFileReader = jenkinsContent.split("\n"); // parse array from content
  let readFileWrite = "";

  // if buildArtifactsFunc doesn't in file, insert at end of jenkins file
  if (!jenkinsContent.includes("buildArtifactsFunc")) {
    tsFileReader.forEach((lineContent) => {
      if (lineContent.startsWith(")", 0)) {
        const buildArtifactsStr = `
          buildArtifactsFunc: {
            sh '''npm install
            npm run test --if-present
            npm run build --if-present
            chmod 777 ./script/remove-devDependencies.sh
            ./script/remove-devDependencies.sh'''
          }
        )
        `;
        readFileWrite = readFileWrite + buildArtifactsStr;
      } else {
        readFileWrite += lineContent;
      }
    });
    writeFileSync(rootPath + "\\JenkinsFile", readFileWrite);
    return true;
  }

  // setup begin in Jenkins file
  let buildScriptFunc = 0;
  // read JenkinsFile
  tsFileReader.forEach((lineContent) => {
    // buildArtifactsFunc end bracket add script text
    if (buildScriptFunc == 1 && lineContent.includes("}")) {
      let removeDepStr = `
        sh ''' chmod 777 ./script/remove-devDependencies.sh
        ./script/remove-devDependencies.sh'''
      `;
      readFileWrite += removeDepStr + '\n';
      buildScriptFunc--;
    }

    // if jenkins file exist 'buildScriptFunc {'
    if (
      lineContent.includes("buildArtifactsFunc") &&
      lineContent.includes("{") &&
      !lineContent.includes("}")
    ) {
      buildScriptFunc++;
    }

    if (buildScriptFunc > 0 && !lineContent.includes("buildArtifactsFunc")) {
      lineContent.includes("{") ? buildScriptFunc++ : null;
      lineContent.includes("}") ? buildScriptFunc-- : null;
    }

    readFileWrite += lineContent;
  });

  // write JenkinsFile
  writeFileSync(rootPath + "\\JenkinsFile", readFileWrite);
  return true;
}

/**
 *
 * @returns Front end jenkins file content; if workspace not open or workspace is not a frontend project, return false
 */
async function getFrontendAppContent() {
  const rootPath = vscode.workspace.rootPath;
  if (!rootPath) {
    vscode.window.showErrorMessage("Please open a workspace");
    return false;
  }

  const filePath = vscode.Uri.file(rootPath + "/JenkinsFile");

  // project non frontend, return directly
  const jenkinsContent = (
    await vscode.workspace.fs.readFile(filePath)
  ).toString();
  if (
    !(
      jenkinsContent.includes("gspPipelineNpmLibrary") ||
      jenkinsContent.includes("gspPipelineNodejs")
    )
  ) {
    return false;
  }
  return jenkinsContent;
}

async function removeDevDependencies(packageUri: vscode.Uri) {
  const rootPath = vscode.workspace.rootPath;
  const jenkinsContent = (
    await vscode.workspace.fs.readFile(packageUri)
  ).toString();
  const tsFileReader = jenkinsContent.split("\n"); // parse array from content
  let buildScriptFunc = 0;
  let readFileWrite = "";
  tsFileReader.forEach((lineContent) => {
    if (buildScriptFunc > 0) {
      lineContent.includes("}")
        ? (buildScriptFunc--, (readFileWrite += lineContent))
        : null;
      return;
    }
    if (lineContent.includes("devDependencies")) {
      buildScriptFunc++;
    }
    readFileWrite += lineContent;
  });
  writeFileSync(rootPath + "\\package.json", readFileWrite);
}

async function backupPackage() {
  let backupCheck = true;
  const rootPath = vscode.workspace.rootPath;
  const packageUri = vscode.Uri.file(rootPath + "/package.json");
  const packageBakUri = vscode.Uri.file(rootPath + "/package.json.bak");
  const packageLockUri = vscode.Uri.file(rootPath + "/package-lock.json");
  const packageLockBakUri = vscode.Uri.file(
    rootPath + "/package-lock.json.bak"
  );

  const isLockFileExist = existsSync(rootPath + "//package-lock.json");

  if (isLockFileExist)
    await vscode.workspace.fs.rename(packageLockUri, packageLockBakUri, {
      overwrite: true,
    });
  await vscode.workspace.fs.copy(packageUri, packageBakUri, {
    overwrite: true,
  });

  // remove dev dependency in new package json
  await removeDevDependencies(packageUri);

  const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
      cp.exec(cmd, (err: any, out: any) => {
        if (err) {
          return reject("");
        }
        return resolve(out);
      });
    });

  let npmResult: string = await execShell(
    `cd ${vscode.workspace.rootPath} & npm install`
  );

  await vscode.workspace.fs.rename(packageBakUri, packageUri, {
    overwrite: true,
  });

  if (isLockFileExist) {
    await vscode.workspace.fs.rename(packageLockBakUri, packageLockUri, {
      overwrite: true,
    });
  } else {
    await vscode.workspace.fs.delete(packageLockUri);
  }

  if (npmResult && npmResult.includes("found 0 vulnerabilities")) {
    npmResult = "";
    backupCheck = true;
  } else {
    writeFileSync(rootPath + "\\bd-scan-result.txt", npmResult);
    backupCheck = false;
  }

  return backupCheck;
}

export function activate(context: vscode.ExtensionContext) {
  register(
    context,
    async () => {
      vscode.window.showInformationMessage("BD fix begin!");
      const jenkinsContent = await getFrontendAppContent();
      if (!jenkinsContent) {
        vscode.window.showErrorMessage("Please Open an ECS Front-end project");
        return false;
      }
      let updateStatus = await updateJenkins(jenkinsContent);
      if (updateStatus) {
        updateStatus = await copyShellFile();
      } else {
        updateStatus = await checkScriptFile();
      }
      if (updateStatus) {
        vscode.window.showInformationMessage(
          "BD fix success! Please check in updated JenkinsFile and script/remove-devDependencies.sh"
        );
      } else {
        vscode.window.showErrorMessage("BD fix failed!");
      }
    },
    "first-test.bd-fix"
  );

  register(
    context,
    async () => {
      vscode.window.showInformationMessage("BD scan begin in dependencies");
      const jenkinsContent = await getFrontendAppContent();
      if (!jenkinsContent) {
        vscode.window.showErrorMessage("Please Open an ECS Front-end project");
        return false;
      }
      const backupPackageResult = await backupPackage();
      if (!backupPackageResult) {
        vscode.window.showErrorMessage(
          "BD scan error, check BD scan report named bd-scan-result.txt"
        );
        return false;
      }
      vscode.window.showInformationMessage(
        "BD scan end! Congratulation, No BD issue in dependencies"
      );
    },
    "first-test.bd-scan"
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
