const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8080';
const OUT_DIR = '/root/afagh/afagh-next/public/help';

const ACCOUNTS = {
  admin: { code: '1000000001', role: 'admin' },
  student1: { code: '29355', role: 'student' },
  student2: { code: '9711151014', role: 'student' },
  prof: { code: '104211', role: 'professor' },
  gm: { code: '104346', role: 'group-manager' },
  prof2: { code: '103532', role: 'professor' },
};

const JOBS = {
  student: {
    user: 'student1',
    pages: [
      { route: '/student', slug: 'dashboard' },
      { route: '/student/schedule', slug: 'schedule' },
      { route: '/student/finance', slug: 'finance' },
      { route: '/student/transcript', slug: 'transcript' },
      { route: '/student/requests', slug: 'requests' },
      { route: '/student/documents', slug: 'documents' },
      { route: '/student/exam-card', slug: 'exam-card' },
      { route: '/student/enroll', slug: 'enroll' },
      { route: '/student/chart', slug: 'chart' },
      { route: '/student/thesis-proposal', slug: 'thesis-proposal' },
      { route: '/student/graduation', slug: 'graduation' },
      { route: '/student/virtual-classes', slug: 'virtual-classes' },
    ],
  },
  'student-start': {
    user: 'student1',
    pages: [
      { route: '/student', slug: 'dashboard' },
      { route: '/change-password', slug: 'password' },
      { route: '/student', slug: 'account-switch', waitFor: 'جابه‌جایی بین حساب‌ها' },
    ],
  },
  professor: {
    user: 'prof',
    pages: [
      { route: '/professor', slug: 'dashboard' },
      { route: '/professor/schedule', slug: 'schedule' },
      { route: '/professor/attendance', slug: 'attendance' },
      { route: '/professor/grades', slug: 'grades' },
      { route: '/professor/availability', slug: 'availability' },
      { route: '/professor/performance', slug: 'performance' },
      { route: '/professor/evaluation', slug: 'evaluation' },
      { route: '/professor/contract', slug: 'contract' },
      { route: '/professor/documents', slug: 'documents' },
      { route: '/help/professor/term-filter', slug: 'term-filter' },
    ],
  },
  'group-manager': {
    user: 'gm',
    pages: [
      { route: '/group-manager', slug: 'offerings' },
      { route: '/group-manager/courses', slug: 'courses' },
      { route: '/group-manager/classrooms', slug: 'classrooms' },
      { route: '/group-manager/equivalence', slug: 'equivalence' },
    ],
  },
  admin: {
    user: 'admin',
    pages: [
      { route: '/admin/terms', slug: 'terms' },
      { route: '/admin/curriculum', slug: 'curriculum' },
      { route: '/admin/universities', slug: 'universities' },
      { route: '/admin/samin', slug: 'samin' },
      { route: '/admin/student-finance', slug: 'finance' },
      { route: '/admin/students', slug: 'staff' },
    ],
  },
  shared: {
    user: null,
    pages: [
      { route: '/login', slug: 'login' },
      { route: '/change-password', slug: 'password' },
      { route: '/student', slug: 'account-switch', waitFor: 'جابه‌جایی بین حساب‌ها' },
      { route: '/help?tab=shared', slug: 'using-help' },
    ],
  },
};

async function redactPage(page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest('script,style,svg,input,textarea,select')) continue;
      let t = node.textContent;
      const orig = t;
      t = t.replace(/\b\d{10}\b/g, '**********');
      t = t.replace(/\b\d{11,12}\b/g, '************');
      t = t.replace(/\b(?!(?:14|13)\d{2}\b)\d{4,8}\b/g, '****');
      t = t.replace(/09\d{9}/g, '09*********');
      t = t.replace(/\S+@\S+\.\S+/g, '***@***.***');
      t = t.replace(/[اآ-ی]{2,}\s+[اآ-ی]{2,}/g, '**** ****');
      if (t !== orig) node.textContent = t;
    }
  });
  await page.evaluate(() => {
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"]').forEach(el => {
      if (el.value && el.value.length > 2) {
        el.value = el.type === 'password' ? '********' : el.value.replace(/\d/g, '*');
      }
    });
  });
  await page.evaluate(() => {
    document.querySelectorAll('td, th').forEach(cell => {
      const t = cell.textContent.trim();
      if (t.match(/^[\d]{10,}$/) || t.match(/^[\d]{4,8}$/) || t.match(/^[اآ-ی]{2,}\s+[اآ-ی]{2,}$/)) {
        cell.textContent = t.replace(/\d/g, '*').replace(/[اآ-ی]/g, '*');
      }
    });
  });
}

async function login(page, account) {
  if (!account) return;
  await page.goto('http://localhost:8080/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[name=code]', account.code);
  await page.fill('input[name=password]', 'Tmp#98765');
  await page.click('button.btn-primary');
  await page.waitForTimeout(4000);
}

async function captureJob(browser, jobName) {
  const job = JOBS[jobName];
  const account = job.user ? ACCOUNTS[job.user] : null;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  if (account) await login(page, account);

  for (const p of job.pages) {
    const url = p.route.startsWith('http') ? p.route : 'http://localhost:8080' + p.route;
    console.log(`  ${jobName}/${p.slug} -> ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (p.waitFor) {
        await page.waitForSelector(`text=${p.waitFor}`, { timeout: 10000 }).catch(() => {});
      }
      await page.waitForTimeout(2000);
      await redactPage(page);
      const outPath = path.join('/root/afagh/afagh-next/public/help', jobName, `${p.slug}-1.png`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`    saved ${outPath}`);
    } catch (e) {
      console.log(`    FAILED: ${e.message.slice(0, 100)}`);
    }
  }
  await ctx.close();
}

async function main() {
  console.log('Starting help screenshots...');
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const jobName of Object.keys(JOBS)) {
    console.log(`\n=== ${jobName} ===`);
    await captureJob(browser, jobName);
  }
  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);