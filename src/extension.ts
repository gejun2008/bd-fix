// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Uri, workspace, WorkspaceEdit } from "vscode";
// import shObject = require('./remove-devDependencies.sh')

// const file=require('fs');
import { readFileSync, exists, writeFileSync } from "fs";

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

function stringToUint8Array(str: string) {
  var arr = [];
  for (var i = 0, j = str.length; i < j; ++i) {
    arr.push(str.charCodeAt(i));
  }

  var tmpUint8Array = new Uint8Array(arr);
  return tmpUint8Array;
}

function copyShellFile() {
  const wsEdit = new vscode.WorkspaceEdit();
  const spaceFolder = vscode.workspace.workspaceFolders;
  if (!spaceFolder) {
    vscode.window.showErrorMessage("Please open folder firstly");
  }

  const wsPath = spaceFolder ? spaceFolder[0].uri.fsPath : null; // gets the path of the first workspace folder
  const filePath = vscode.Uri.file(
    wsPath + "/script/remove-devDependencies.sh"
  );

  const removeDepContent = getDevDependenciesStr();
  vscode.workspace.fs.writeFile(filePath, stringToUint8Array(removeDepContent));
  //   writeFileSync(filePath.toString(), removeDepContent);
  return;
}

async function findJenkinsAndUpdate() {
  const rootPath = vscode.workspace.rootPath;
  if (!rootPath) {
    vscode.window.showErrorMessage("Please open a workspace");
    return false;
  }

  const tsFileReader = readFileSync(rootPath + "\\JenkinsFile")
    .toString("utf8")
    .split("\n"); // consider jenkins file exist
  let readFileWrite = "";
  let buildScriptFunc = 0;
  // read JenkinsFile
  tsFileReader.forEach((lineContent) => {
    if (
      lineContent.includes("script/remove-devDependencies.sh") &&
      buildScriptFunc > 0
    ) {
      buildScriptFunc--;
    }
    if (
      lineContent.includes("buildArtifactsFunc") &&
      lineContent.includes("{")
    ) {
      buildScriptFunc++;
      readFileWrite += lineContent + " \n";
    } else {
      if (buildScriptFunc > 0 && lineContent.includes("}")) {
        let addRemoveDevStr =
          "\t\tsh ''' chmod 777 ./script/remove-devDependencies.sh \n";
        addRemoveDevStr += "\t\t./script/remove-devDependencies.sh''' \n";
        addRemoveDevStr += lineContent + " \n";
        readFileWrite += addRemoveDevStr;
        buildScriptFunc--;
      } else {
        readFileWrite += lineContent + " \n";
      }
    }
  });

  // write JenkinsFile
  writeFileSync(rootPath + "\\JenkinsFile", readFileWrite);
  return true;
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "first-test" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "first-test.helloWorld",
    async () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("BD fix begin!");
      let updateStatus = await findJenkinsAndUpdate();
      if (updateStatus) {
        copyShellFile();
      }
      vscode.window.showInformationMessage("BD fix finish!");
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
function uriOrString(uriOrString: any, arg1: number) {
  throw new Error("Function not implemented.");
}
