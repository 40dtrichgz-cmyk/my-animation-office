export interface CliInvocation {
    command: string;
    args: string[];
    stdin: string;
    env: Record<string, string>;
}

export type CliParseResult = { ok: true; content: string } | { ok: false; error: string };

export interface CliDriver {
    readonly name: string;                                  // 'claude' | 'opencode' | 'gemini'
    buildInvocation(prompt: string, model: string | undefined, cwd: string): CliInvocation;
    parseOutput(stdout: string, stderr: string, exitCode: number): CliParseResult;
    healthCheck(): Promise<boolean>;
}
