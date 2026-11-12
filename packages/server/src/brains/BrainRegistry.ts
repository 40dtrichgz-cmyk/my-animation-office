import * as fs from 'fs';
import * as path from 'path';
import {
    CliBrainAdapter,
    CliDriver,
    claudeDriver,
    geminiDriver,
    opencodeDriver,
} from '@agent-office/adapters';

export interface BrainEntry {
    driver: 'claude' | 'opencode' | 'gemini';
    model?: string;
}

export interface BrainRegistryOptions {
    workspaceRoot: string;
    timeoutMs?: number;
}

const KNOWN_DRIVERS = ['claude', 'opencode', 'gemini'] as const;
type DriverName = (typeof KNOWN_DRIVERS)[number];

/**
 * Pins the model from brains.json onto a driver.
 *
 * `CliBrainAdapter` forwards `request.model`, which comes from the core agent
 * config and is provider-agnostic. The chain itself is what decides which CLI
 * (and therefore which model naming scheme) runs, so each driver is wrapped
 * with the model configured for it here.
 */
function withModel(driver: CliDriver, model: string | undefined): CliDriver {
    if (model === undefined) {
        return driver;
    }

    return {
        name: driver.name,
        buildInvocation: (prompt, _requestModel, cwd) => driver.buildInvocation(prompt, model, cwd),
        parseOutput: (stdout, stderr, exitCode) => driver.parseOutput(stdout, stderr, exitCode),
        healthCheck: () => driver.healthCheck(),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDriverName(name: string): name is DriverName {
    return (KNOWN_DRIVERS as readonly string[]).includes(name);
}

function parseEntry(agentId: string, raw: unknown): BrainEntry {
    if (!isRecord(raw)) {
        throw new Error(`agent "${agentId}": each brain entry must be an object in brains.json`);
    }

    const driver = raw.driver;
    if (typeof driver !== 'string' || !isDriverName(driver)) {
        throw new Error(
            `agent "${agentId}": unknown driver "${String(driver)}" in brains.json — must be one of ${KNOWN_DRIVERS.join(', ')}`
        );
    }

    if (raw.model !== undefined && typeof raw.model !== 'string') {
        throw new Error(`agent "${agentId}": model for driver "${driver}" must be a string in brains.json`);
    }

    return { driver, model: raw.model };
}

function parseConfig(json: unknown): Map<string, BrainEntry[]> {
    if (!isRecord(json)) {
        throw new Error('brains.json must be an object mapping agent id to a non-empty brain chain');
    }

    const parsed = new Map<string, BrainEntry[]>();

    for (const [agentId, rawChain] of Object.entries(json)) {
        if (!Array.isArray(rawChain)) {
            throw new Error(`agent "${agentId}": brain chain must be an array in brains.json`);
        }

        if (rawChain.length === 0) {
            throw new Error(`agent "${agentId}": empty brain chain in brains.json — add at least one driver`);
        }

        const chain = rawChain.map((entry) => parseEntry(agentId, entry));

        for (let i = 1; i < chain.length; i++) {
            if (chain[i].driver === chain[i - 1].driver) {
                throw new Error(
                    `agent "${agentId}": driver "${chain[i].driver}" repeats consecutively in brains.json — use a different provider for fallback`
                );
            }
        }

        parsed.set(agentId, chain);
    }

    return parsed;
}

export class BrainRegistry {
    private readonly chains: Map<string, CliDriver[]>;
    private readonly drivers: Map<string, CliDriver>;
    private readonly workspaceRoot: string;
    private readonly timeoutMs: number | undefined;
    private healthChecked = false;
    private health: Record<string, boolean> = {};

    private constructor(
        chains: Map<string, CliDriver[]>,
        drivers: Map<string, CliDriver>,
        opts: BrainRegistryOptions
    ) {
        this.chains = chains;
        this.drivers = drivers;
        this.workspaceRoot = opts.workspaceRoot;
        this.timeoutMs = opts.timeoutMs;
    }

    static load(
        json: unknown,
        opts: BrainRegistryOptions,
        driverFactory?: Record<string, () => CliDriver>
    ): BrainRegistry {
        const parsed = parseConfig(json);

        const defaultFactory: Record<DriverName, () => CliDriver> = {
            claude: () => claudeDriver(),
            opencode: () => opencodeDriver(path.join(opts.workspaceRoot, 'opencode-data')),
            gemini: () => geminiDriver(),
        };

        const drivers = new Map<string, CliDriver>();
        const chains = new Map<string, CliDriver[]>();

        for (const [agentId, entries] of parsed) {
            chains.set(
                agentId,
                entries.map((entry) => {
                    let driver = drivers.get(entry.driver);
                    if (!driver) {
                        driver = (driverFactory?.[entry.driver] ?? defaultFactory[entry.driver])();
                        drivers.set(entry.driver, driver);
                    }
                    return withModel(driver, entry.model);
                })
            );
        }

        return new BrainRegistry(chains, drivers, opts);
    }

    getAdapter(agentId: string): CliBrainAdapter | undefined {
        const chain = this.chains.get(agentId);
        if (!chain) {
            return undefined;
        }

        const healthyChain = this.healthChecked ? chain.filter((driver) => this.health[driver.name]) : chain;
        // Filtering everything out would leave the agent brainless; keep the
        // full chain so driver errors surface in chat instead.
        const effective = healthyChain.length > 0 ? healthyChain : chain;

        return new CliBrainAdapter(effective, {
            cwd: path.join(this.workspaceRoot, 'agents', agentId),
            timeoutMs: this.timeoutMs,
        });
    }

    agentIds(): string[] {
        return Array.from(this.chains.keys());
    }

    async healthCheck(): Promise<Record<string, boolean>> {
        if (this.healthChecked) {
            return this.health;
        }

        const results = await Promise.all(
            Array.from(this.drivers.entries()).map(async ([name, driver]) => {
                try {
                    return [name, await driver.healthCheck()] as const;
                } catch {
                    return [name, false] as const;
                }
            })
        );

        this.health = Object.fromEntries(results);
        this.healthChecked = true;
        return this.health;
    }

    static resolveBrainsPath(): string {
        const candidates = [
            path.join(__dirname, 'brains.json'),
            path.join(__dirname, '..', '..', 'src', 'brains', 'brains.json'),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        throw new Error(`brains.json not found. Looked in: ${candidates.join(', ')}`);
    }
}
