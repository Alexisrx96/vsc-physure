import * as vscode from 'vscode';
import { findAssignmentSymbols } from '../tokenizer';
import { getCachedLineResults, onInlayHintsChangeEvent } from './evalCodeLens';
import { documentLines } from '../utils';

export class VariableItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly line: number,
        public readonly isFunction: boolean,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);

        this.description = value ? `= ${value}` : '';
        this.tooltip = `${label} ${value ? `= ${value}` : ''} (line ${line + 1})`;
        this.iconPath = new vscode.ThemeIcon(isFunction ? 'symbol-function' : 'symbol-variable');
        this.command = {
            command: 'vsc-physure.goToVariableLine',
            title: 'Go to Variable Line',
            arguments: [line],
        };
    }
}

export class PhysureVariableTreeDataProvider implements vscode.TreeDataProvider<VariableItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<VariableItem | undefined | null | void> =
        new vscode.EventEmitter<VariableItem | undefined | null | void>();
    public readonly onDidChangeTreeData: vscode.Event<VariableItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor() {
        onInlayHintsChangeEvent.event(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: VariableItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: VariableItem): VariableItem[] {
        if (element) {
            return [];
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'phs') {
            return [];
        }

        const doc = activeEditor.document;
        const lines = documentLines(doc);
        const symbols = findAssignmentSymbols(lines);
        const resultsMap = new Map<number, string>();

        for (const item of getCachedLineResults(doc.uri.toString())) {
            resultsMap.set(item.line, item.output);
        }

        const items: VariableItem[] = [];
        for (const sym of symbols) {
            const val = resultsMap.get(sym.line) ?? '';
            const isFn = sym.name.includes('(');
            items.push(
                new VariableItem(
                    sym.name,
                    val,
                    sym.line,
                    isFn,
                    vscode.TreeItemCollapsibleState.None
                )
            );
        }

        return items;
    }
}

export function registerVariableExplorer(context: vscode.ExtensionContext): PhysureVariableTreeDataProvider {
    const provider = new PhysureVariableTreeDataProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('vsc-physure.variableExplorer', provider)
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            provider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.languageId === 'phs') {
                provider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-physure.goToVariableLine', (line: number) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && typeof line === 'number') {
                const pos = new vscode.Position(line, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            }
        })
    );

    return provider;
}
