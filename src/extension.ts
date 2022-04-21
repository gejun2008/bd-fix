// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { existsSync, writeFileSync } from "fs";

import * as cp from "child_process";

/**
 * register command when install extension
 * @param context: vscode context
 * @param callback: async callback function
 * @param commandName: command at commandlet
 */
function registerFunc(
  context: vscode.ExtensionContext,
  callback: (...args: any[]) => any,
  commandName: string
) {
  const disposable = vscode.commands.registerCommand(commandName, callback);
  context.subscriptions.push(disposable);
}

/**
 * Convent string to Uint8Array
 * @param str
 * @returns Uint8Array
 */
function stringToUint8Array(str: string) {
  var arr = [];
  for (var i = 0, j = str.length; i < j; ++i) {
    arr.push(str.charCodeAt(i));
  }

  var tmpUint8Array = new Uint8Array(arr);
  return tmpUint8Array;
}

/**
 * Extension Context for some functionality such as copy internal file to workspace
 * @param context
 * @returns
 */
async function checkScriptFile(context: vscode.ExtensionContext): Promise<boolean> {
  const rootPath = vscode.workspace.rootPath;
  const isScriptFileExist = existsSync(rootPath + "//script//remove-devDependencies.sh");
  if (isScriptFileExist) {
    return true;
  }
  return copyShellFile(context);
}

async function copyShellFile(context: vscode.ExtensionContext): Promise<boolean> {
  const spaceFolder = vscode.workspace.workspaceFolders;
  if (!spaceFolder) {
    vscode.window.showErrorMessage("Please open folder firstly");
  }

  const wsPath = spaceFolder ? spaceFolder[0].uri.fsPath : null; // gets the path of the first workspace folder
  const filePath = vscode.Uri.file(wsPath + "/script/remove-devDependencies.sh");

  const originSourcePathUri = vscode.Uri.joinPath(
    context.extensionUri,
    "./resource/remove-devDependencies.sh"
  );
  await vscode.workspace.fs.copy(originSourcePathUri, filePath, {
    overwrite: true,
  });

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
        `;
        readFileWrite = readFileWrite + buildArtifactsStr + "\n" + ")";
      } else {
        readFileWrite += lineContent + "\n";
      }
    });
    vscode.Uri.file;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(rootPath + "/JenkinsFile"),
      stringToUint8Array(readFileWrite)
    );
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
      readFileWrite += removeDepStr + "\n";
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

    readFileWrite += lineContent + "\n";
  });

  // write JenkinsFile
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(rootPath + "/JenkinsFile"),
    stringToUint8Array(readFileWrite)
  );
  return true;
}

/**
 * check package.json and package-lock.json file existence,
 * @return true if existed both, otherwise false
 */
async function checkPackageAndLockFile() {
  const rootPath = vscode.workspace.rootPath;
  const packageFileExist = existsSync(rootPath + "//package.json");
  const lockFileExist = existsSync(rootPath + "//package-lock.json");
  if (packageFileExist && lockFileExist) {
    return true;
  }
  return false;
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

/**
 * The function is used to check dependencies BD issue. Only check vulnerability issue at dependencies
 * @returns true if no BD issue, otherwise false
 */
async function checkDependenciesBDIssue(): Promise<boolean | undefined> {
  const rootPath = vscode.workspace.rootPath;

  if (!rootPath) {
    return;
  }

  let checkSuccess = true;

  const disk = rootPath.slice(0, 2);
  const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
      cp.exec(cmd, (err: any, out: any) => {
        if (out) {
          return resolve(out);
        }
        if (err) {
          return reject("");
        }
      });
    });

  let npmResult: string = await execShell(
    `${disk} && cd ${vscode.workspace.rootPath} && npm audit --production`
  );

  if (npmResult && npmResult.includes("found 0 vulnerabilities")) {
    npmResult = "";
    checkSuccess = true;
  } else {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(rootPath + "/bd-scan-report.txt"),
      stringToUint8Array(npmResult)
    );
    checkSuccess = false;
  }

  return checkSuccess;
}

/**
 * Activate extension to register command
 * @param context 
 */
export function activate(context: vscode.ExtensionContext) {
  registerFunc(
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
        updateStatus = await copyShellFile(context);
      } else {
        updateStatus = await checkScriptFile(context);
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

  registerFunc(
    context,
    async () => {
      const jenkinsContent = await getFrontendAppContent();
      if (!jenkinsContent) {
        vscode.window.showErrorMessage("Please Open an ECS Front-end project");
        return false;
      }

      const packageFileAndLockFile = await checkPackageAndLockFile();
      if (!packageFileAndLockFile) {
        vscode.window.showErrorMessage(
          "Please make sure this project exist package.json and package-lock.json"
        );
        return false;
      }

      const backupPackageResult = await checkDependenciesBDIssue();
      if (!backupPackageResult) {
        vscode.window.showErrorMessage(
          "BD scan end! Dependencies exist BD issue, check bd-scan-report.txt in workspace for more information"
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
export function deactivate() { }
