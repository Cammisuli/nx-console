import { commands, ExtensionContext, window, Uri } from 'vscode';

import { selectSchematic } from '../select-schematic';
import { verifyWorkspace } from '../verify-workspace/verify-workspace';
import { verifyBuilderDefinition } from '../verify-workspace/verify-builder-definition';
import {
  WorkspaceRouteTitle,
  WorkspaceTreeItem,
} from '../workspace-tree/workspace-tree-item';
import { CliTaskProvider } from './cli-task-provider';
import { CliTaskQuickPickItem } from './cli-task-quick-pick-item';
import { selectFlags } from './select-flags';
import { Option } from '@nx-console/schema';
import { OptionType } from '@angular/cli/models/interface';
const CLI_COMMAND_LIST = [
  'build',
  'deploy',
  'e2e',
  'lint',
  'serve',
  'test',
  'xi18n',
];

let cliTaskProvider: CliTaskProvider;

export function registerCliTaskCommands(
  context: ExtensionContext,
  n: CliTaskProvider
) {
  cliTaskProvider = n;

  CLI_COMMAND_LIST.forEach((command) => {
    context.subscriptions.push(
      commands.registerCommand(`ng.${command}`, () =>
        selectCliCommandAndPromptForFlags(command)
      ),
      commands.registerCommand(`ng.${command}.ui`, () =>
        selectCliCommandAndShowUi(command, context.extensionPath)
      ),
      commands.registerCommand(`nx.${command}`, () =>
        selectCliCommandAndPromptForFlags(command)
      ),
      commands.registerCommand(`nx.${command}.ui`, () =>
        selectCliCommandAndShowUi(command, context.extensionPath)
      )
    );
  });

  commands.registerCommand(`ng.generate`, () =>
    selectSchematicAndPromptForFlags(n.getWorkspacePath())
  );

  commands.registerCommand(`ng.generate.ui`, () =>
    selectCliCommandAndShowUi('generate', context.extensionPath)
  );
  commands.registerCommand(`nx.generate`, () =>
    selectSchematicAndPromptForFlags(n.getWorkspacePath())
  );

  commands.registerCommand(`nx.generate.ui`, () =>
    selectCliCommandAndShowUi('generate', context.extensionPath)
  );
  commands.registerCommand(`nx.generate.ui.fileexplorer`, (uri: Uri) =>
    selectCliCommandAndShowUi('generate', context.extensionPath, uri)
  );
}

function selectCliCommandAndShowUi(
  command: string,
  extensionPath: string,
  uri?: Uri
) {
  const workspacePath = cliTaskProvider.getWorkspacePath();
  if (!workspacePath) {
    window.showErrorMessage(
      'Nx Console requires a workspace be set to perform this action'
    );
    return;
  }
  const { validWorkspaceJson, configuratoinFilePath } = verifyWorkspace(
    cliTaskProvider.getWorkspacePath()
  );
  if (!validWorkspaceJson) {
    window.showErrorMessage('Invalid configuration file');
    return;
  }
  const workspaceTreeItem = new WorkspaceTreeItem(
    configuratoinFilePath,
    `${command[0].toUpperCase()}${command.slice(1)}` as WorkspaceRouteTitle,
    extensionPath
  );

  commands.executeCommand(
    'nxConsole.revealWebViewPanel',
    workspaceTreeItem,
    uri
  );
}

async function selectCliCommandAndPromptForFlags(command: string) {
  const { validWorkspaceJson, json, workspaceType } = verifyWorkspace(
    cliTaskProvider.getWorkspacePath()
  );

  const selection = validWorkspaceJson
    ? await selectCliProject(command, json)
    : undefined;
  if (!selection) {
    return; // Do not execute a command if user clicks out of VSCode UI.
  }

  let { validBuilder, options, configurations } = await verifyBuilderDefinition(
    selection.projectName,
    command,
    json
  );
  if (!validBuilder) {
    return;
  }

  if (configurations.length) {
    const configurationsOption: Option = {
      name: 'configuration',
      description:
        'A named build target, as specified in the "configurations" section of angular.json.',
      type: OptionType.String,
      enum: configurations,
      aliases: [],
    };
    options = [configurationsOption, ...options];
  }

  const flags = await selectFlags(
    `${command} ${selection.projectName}`,
    options,
    workspaceType
  );

  if (flags !== undefined) {
    cliTaskProvider.executeTask({
      positional: selection.projectName,
      command,
      flags,
    });
  }
}

async function selectSchematicAndPromptForFlags(workspacePath: string) {
  const {
    validWorkspaceJson,
    workspaceType,
    configuratoinFilePath,
  } = verifyWorkspace(workspacePath);

  if (!validWorkspaceJson) {
    return;
  }

  const selection = await selectSchematic(configuratoinFilePath);
  if (!selection) {
    return;
  }

  const flags = await selectFlags(
    `generate ${selection.positional}`,
    selection.options,
    workspaceType
  );

  if (flags !== undefined) {
    cliTaskProvider.executeTask({
      positional: selection.positional,
      command: 'generate',
      flags,
    });
  }
}

export function selectCliProject(command: string, json: any) {
  const items = cliTaskProvider
    .getProjectEntries(json)
    .filter(([_, { architect }]) => Boolean(architect))
    .flatMap(([project, { architect }]) => ({ project, architect }))
    .filter(({ architect }) => Boolean(architect && architect[command]))
    .map(
      ({ project, architect }) =>
        new CliTaskQuickPickItem(
          project,
          architect![command]!,
          command,
          project
        )
    );

  if (!items.length) {
    window.showInformationMessage(
      `No projects have an architect command for ${command}`
    );

    return;
  }

  return window.showQuickPick(items, {
    placeHolder: `Project to ${command}`,
  });
}
