import * as vscode from 'vscode';

class Logger {
    private channel: vscode.OutputChannel | undefined;

    public init(context: vscode.ExtensionContext): void {
        this.channel = vscode.window.createOutputChannel('Physure Extension');
        context.subscriptions.push(this.channel);
        this.info('Physure extension logger initialized.');
    }

    private format(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    public info(message: string): void {
        const formatted = this.format('INFO', message);
        console.log(formatted);
        this.channel?.appendLine(formatted);
    }

    public warn(message: string): void {
        const formatted = this.format('WARN', message);
        console.warn(formatted);
        this.channel?.appendLine(formatted);
    }

    public error(message: string, error?: any): void {
        let fullMsg = message;
        if (error) {
            if (error instanceof Error) {
                fullMsg += ` | ${error.message}\n${error.stack ?? ''}`;
            } else {
                fullMsg += ` | ${JSON.stringify(error)}`;
            }
        }
        const formatted = this.format('ERROR', fullMsg);
        console.error(formatted);
        this.channel?.appendLine(formatted);
    }

    public show(): void {
        this.channel?.show(true);
    }
}

export const logger = new Logger();
