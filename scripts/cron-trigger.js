// cron-trigger.js — รัน workflow เช้า 8:00 ทุกวัน
// ใช้งาน: node scripts/cron-trigger.js
// หรือใช้ Windows Task Scheduler: schtasks /create /tn "AnimationOffice Morning" /tr "node C:\path\to\scripts\cron-trigger.js" /sc daily /st 08:00

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMPANY_DIR = path.join(__dirname, '..', 'company');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'cron.log');

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}\n`;
    console.log(line.trim());
    fs.appendFileSync(LOG_FILE, line);
}

function runAgent(agentId, prompt) {
    log(`Running ${agentId}...`);
    try {
        // Use claude CLI for simple agents, opencode for others
        const isClaude = ['director', 'animator', 'researcher'].includes(agentId);
        const cmd = isClaude
            ? `claude -p --output-format json --model haiku`
            : `opencode run --format json`;
        const result = execSync(`echo "${prompt}" | ${cmd}`, { timeout: 180000, encoding: 'utf8' });
        log(`${agentId} completed: ${result.slice(0, 100)}`);
        return result;
    } catch (err) {
        log(`${agentId} failed: ${err.message}`);
        return null;
    }
}

function morningWorkflow() {
    log('=== Morning Workflow Started ===');

    // 1. inbox: อ่านอีเมลใหม่ → ร่าง reply → เขียน drafts/
    runAgent('inbox', 'อ่านอีเมลใหม่จาก Gmail และร่าง reply สำหรับแต่ละอีเมล เขียนลง company/support/drafts/');

    // 2. analyst: อ่านข้อมูลเมื่อวาน → สร้าง report → เขียน finance/report.md
    runAgent('analyst', 'อ่านข้อมูลจาก company/sales/leads.md และ company/marketing/posts.md แล้วสร้างรายงานสรุป เขียนลง company/finance/report.md');

    // 3. planner: อ่าน tasks ค้าง + report → สร้าง daily plan → เขียน ops/daily-plan.md
    runAgent('planner', 'อ่าน report จาก company/finance/report.md และ tasks จาก shared/tasks.json แล้วสร้างแผนงานประจำวัน เขียนลง company/ops/daily-plan.md');

    // 4. รวบรวม summary → ส่ง Telegram
    log('=== Morning Workflow Completed ===');
    log('Summary: inbox drafted replies, analyst created report, planner created daily plan');
    log('Sending Telegram notification...');
    // TODO: Send Telegram message via MCP or direct API
}

// Run immediately if called directly
if (require.main === module) {
    morningWorkflow();
}

module.exports = { morningWorkflow };
