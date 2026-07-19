import * as vscode from 'vscode';
import { STANDARD_UNITS, BUILTIN_FUNCTIONS } from '../tokenizer';
import { GREEK_SYMBOLS } from './completion';

export interface PaletteItem {
    symbol: string;
    description: string;
    category: string;
    insertText: string;
}

export const CONSTANTS_LIST: PaletteItem[] = [
    { symbol: 'm_p', description: 'Proton mass (1.673e-27 kg)', category: 'Constants', insertText: 'm_p = 1.673e-27 kg' },
    { symbol: 'm_n', description: 'Neutron mass (1.675e-27 kg)', category: 'Constants', insertText: 'm_n = 1.675e-27 kg' },
    { symbol: 'm_e', description: 'Electron mass (9.109e-31 kg)', category: 'Constants', insertText: 'm_e = 9.109e-31 kg' },
    { symbol: 'e', description: 'Elementary charge (1.602e-19 C)', category: 'Constants', insertText: 'e = 1.602e-19 C' },
    { symbol: 'k', description: 'Coulomb constant (8.98755e9 N*m²/C²)', category: 'Constants', insertText: 'k = 8.98755e9 N * m^2 / C^2' },
    { symbol: 'G', description: 'Gravitational constant (6.6743e-11 N*m²/kg²)', category: 'Constants', insertText: 'G = 6.67430e-11 N * m^2 / kg^2' },
    { symbol: 'c', description: 'Speed of light in vacuum (2.99792e8 m/s)', category: 'Constants', insertText: 'c = 2.99792458e8 m / s' },
    { symbol: 'h', description: 'Planck constant (6.62607e-34 J*s)', category: 'Constants', insertText: 'h = 6.62607015e-34 J * s' },
    { symbol: 'kB', description: 'Boltzmann constant (1.380649e-23 J/K)', category: 'Constants', insertText: 'kB = 1.380649e-23 J / K' },
    { symbol: 'NA', description: 'Avogadro constant (6.02214e23 1/mol)', category: 'Constants', insertText: 'NA = 6.02214076e23 1 / mol' },
    { symbol: 'R', description: 'Gas constant (8.31446 J/(mol*K))', category: 'Constants', insertText: 'R = 8.314462618 J / (mol * K)' },
];

export const CATEGORIZED_UNITS: PaletteItem[] = [
    // Force & Mechanics
    { symbol: 'N', description: 'Newton (Force)', category: 'Units', insertText: ' N' },
    { symbol: 'kN', description: 'Kilonewton (Force)', category: 'Units', insertText: ' kN' },
    { symbol: 'lb', description: 'Pound (Force/Mass)', category: 'Units', insertText: ' lb' },
    { symbol: 'lbf', description: 'Pound-force', category: 'Units', insertText: ' lbf' },
    // Pressure & Stress
    { symbol: 'Pa', description: 'Pascal (Pressure)', category: 'Units', insertText: ' Pa' },
    { symbol: 'kPa', description: 'Kilopascal', category: 'Units', insertText: ' kPa' },
    { symbol: 'MPa', description: 'Megapascal', category: 'Units', insertText: ' MPa' },
    { symbol: 'bar', description: 'Bar (Pressure)', category: 'Units', insertText: ' bar' },
    { symbol: 'psi', description: 'Pounds per square inch', category: 'Units', insertText: ' psi' },
    { symbol: 'atm', description: 'Standard Atmosphere', category: 'Units', insertText: ' atm' },
    // Energy & Power
    { symbol: 'J', description: 'Joule (Energy)', category: 'Units', insertText: ' J' },
    { symbol: 'kJ', description: 'Kilojoule', category: 'Units', insertText: ' kJ' },
    { symbol: 'W', description: 'Watt (Power)', category: 'Units', insertText: ' W' },
    { symbol: 'kW', description: 'Kilowatt', category: 'Units', insertText: ' kW' },
    { symbol: 'MW', description: 'Megawatt', category: 'Units', insertText: ' MW' },
    { symbol: 'cal', description: 'Calorie', category: 'Units', insertText: ' cal' },
    { symbol: 'Btu', description: 'British Thermal Unit', category: 'Units', insertText: ' Btu' },
    // Electricity & Magnetism
    { symbol: 'C', description: 'Coulomb (Electric Charge)', category: 'Units', insertText: ' C' },
    { symbol: 'V', description: 'Volt (Electric Potential)', category: 'Units', insertText: ' V' },
    { symbol: 'kV', description: 'Kilovolt', category: 'Units', insertText: ' kV' },
    { symbol: 'A', description: 'Ampere (Electric Current)', category: 'Units', insertText: ' A' },
    { symbol: 'mA', description: 'Milliampere', category: 'Units', insertText: ' mA' },
    { symbol: 'Ohm', description: 'Ohm (Resistance)', category: 'Units', insertText: ' Ohm' },
    { symbol: 'F', description: 'Farad (Capacitance)', category: 'Units', insertText: ' F' },
    { symbol: 'T', description: 'Tesla (Magnetic Flux Density)', category: 'Units', insertText: ' T' },
    { symbol: 'Hz', description: 'Hertz (Frequency)', category: 'Units', insertText: ' Hz' },
    // Kinematics & Space
    { symbol: 'm', description: 'Meter (Length)', category: 'Units', insertText: ' m' },
    { symbol: 'cm', description: 'Centimeter', category: 'Units', insertText: ' cm' },
    { symbol: 'mm', description: 'Millimeter', category: 'Units', insertText: ' mm' },
    { symbol: 'km', description: 'Kilometer', category: 'Units', insertText: ' km' },
    { symbol: 's', description: 'Second (Time)', category: 'Units', insertText: ' s' },
    { symbol: 'min', description: 'Minute', category: 'Units', insertText: ' min' },
    { symbol: 'h', description: 'Hour', category: 'Units', insertText: ' h' },
    { symbol: 'kg', description: 'Kilogram (Mass)', category: 'Units', insertText: ' kg' },
    { symbol: 'g', description: 'Gram', category: 'Units', insertText: ' g' },
    { symbol: 'rad', description: 'Radian (Angle)', category: 'Units', insertText: ' rad' },
    { symbol: 'deg', description: 'Degree (Angle)', category: 'Units', insertText: ' deg' },
];

export const FUNCTION_TEMPLATES: PaletteItem[] = [
    { symbol: 'linspace', description: 'Generates evenly spaced vector range', category: 'Functions', insertText: 'linspace(0.01 m, 0.5 m, 50)' },
    { symbol: 'plot', description: 'Generates real-time calculation figure', category: 'Functions', insertText: 'plot(x_range, y_range)' },
    { symbol: 'sqrt', description: 'Square root', category: 'Functions', insertText: 'sqrt(' },
    { symbol: 'sin', description: 'Sine of angle', category: 'Functions', insertText: 'sin(' },
    { symbol: 'cos', description: 'Cosine of angle', category: 'Functions', insertText: 'cos(' },
    { symbol: 'tan', description: 'Tangent of angle', category: 'Functions', insertText: 'tan(' },
    { symbol: 'min', description: 'Minimum value', category: 'Functions', insertText: 'min(' },
    { symbol: 'max', description: 'Maximum value', category: 'Functions', insertText: 'max(' },
    { symbol: 'round', description: 'Round to decimal places', category: 'Functions', insertText: 'round(' },
];

/**
 * Sidebar Cheat-Sheet & Unit Palette for quick insertion of physical constants,
 * units, and function templates into active .phs files.
 */
export class PhysureUnitPaletteProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vsc-physure.unitPalette';

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage((message) => {
            if (message.command === 'insert') {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.edit((editBuilder) => {
                        editBuilder.insert(editor.selection.active, message.text);
                    });
                }
            }
        });
    }

    private _getHtmlForWebview(): string {
        const allItems: PaletteItem[] = [
            ...CONSTANTS_LIST,
            ...CATEGORIZED_UNITS,
            ...FUNCTION_TEMPLATES,
            ...GREEK_SYMBOLS.map((g) => ({
                symbol: g.symbol,
                description: `${g.name} (${g.shortcut})`,
                category: 'Greek Symbols',
                insertText: g.symbol,
            })),
        ];

        const jsonItems = JSON.stringify(allItems);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: var(--vscode-font-family); padding: 8px; color: var(--vscode-foreground); background-color: var(--vscode-sideBar-background); }
        .search-box { width: 100%; box-sizing: border-box; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--vscode-widget-border, #444); background: var(--vscode-input-background, #1e1e1e); color: var(--vscode-input-foreground, #fff); font-size: 0.9em; outline: none; margin-bottom: 10px; }
        .search-box:focus { border-color: var(--vscode-focusBorder, #007acc); }
        h4 { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); margin: 12px 0 6px 0; border-bottom: 1px solid var(--vscode-widget-border, #333); padding-bottom: 4px; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.5px; }
        .item-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 6px; border-bottom: 1px dashed var(--vscode-widget-border, #2d2d2d); }
        .item-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
        .item-sym { font-family: monospace; font-weight: bold; color: var(--vscode-symbolIcon-fieldForeground, #4ec9b0); }
        .item-desc { font-size: 0.82em; color: var(--vscode-descriptionForeground, #aaa); margin-left: 6px; }
        .btn-add { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #fff); border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 0.8em; }
        .btn-add:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    </style>
</head>
<body>
    <input type="text" id="search" class="search-box" placeholder="🔍 Search units, constants, symbols..." onkeyup="render()" />

    <div id="content"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const items = ${jsonItems};

        function insert(text) {
            vscode.postMessage({ command: 'insert', text: text });
        }

        function render() {
            const query = document.getElementById('search').value.toLowerCase().trim();
            const container = document.getElementById('content');
            container.innerHTML = '';

            const filtered = items.filter(i => 
                i.symbol.toLowerCase().includes(query) ||
                i.description.toLowerCase().includes(query) ||
                i.category.toLowerCase().includes(query)
            );

            const categories = {};
            filtered.forEach(i => {
                if (!categories[i.category]) categories[i.category] = [];
                categories[i.category].push(i);
            });

            if (Object.keys(categories).length === 0) {
                container.innerHTML = '<div style="padding: 10px; color: #888; font-size: 0.9em;">No matching items found.</div>';
                return;
            }

            for (const [cat, catItems] of Object.entries(categories)) {
                const header = document.createElement('h4');
                header.textContent = cat;
                container.appendChild(header);

                catItems.forEach(i => {
                    const row = document.createElement('div');
                    row.className = 'item-row';
                    row.innerHTML = \`
                        <div>
                            <span class="item-sym">\${escapeHtml(i.symbol)}</span>
                            <span class="item-desc">\${escapeHtml(i.description)}</span>
                        </div>
                        <button class="btn-add" onclick="insert(\\\'\${escapeJs(i.insertText)}\\\')">+ Add</button>
                    \`;
                    container.appendChild(row);
                });
            }
        }

        function escapeHtml(text) {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        function escapeJs(text) {
            return text.replace(/'/g, "\\\\'");
        }

        render();
    </script>
</body>
</html>`;
    }
}
