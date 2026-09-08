"""Local Chromium smoke: genuine login action, secure cookie, authenticated read.
Requires Playwright + Chromium and a local Caddy internal-CA HTTPS endpoint.
Certificate verification bypass applies ONLY to this ephemeral local test CA.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
if os.environ.get('HEAVY_TEST_ACK') != 'isolated-local-only':
    raise RuntimeError('Explicit isolated environment required')
f = json.loads(Path(os.environ.get('HEAVY_FIXTURE_FILE', '/home/user/.cache/heavy-fixtures.json')).read_text())
base = 'https://localhost:58443'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(ignore_https_errors=True, extra_http_headers={
        'X-Forwarded-For':'203.0.113.77', 'X-Forwarded-Proto':'http',
        'X-Afagh-Client-IP':'203.0.113.77', 'X-Afagh-Proxy-Token':'forged',
    })
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    response=page.goto(base+'/login')
    tls=response.security_details()
    page.get_by_placeholder('کد ملی').fill(f['browser']['code'])
    page.get_by_placeholder('رمز عبور', exact=True).fill(f['browser']['pass'])
    page.get_by_role('button',name='ورود',exact=True).click()
    page.wait_for_url('**/change-password',timeout=30000)
    cookies=context.cookies()
    cookie=next(c for c in cookies if c['name']=='token')
    assert cookie['secure'] is True
    assert cookie['httpOnly'] is True
    assert cookie['sameSite']=='None'
    assert 'token=' not in page.evaluate('document.cookie')
    read=context.request.get(base+'/api/archive/'+str(f['docId']))
    assert read.status==200, read.status
    assert read.headers.get('x-content-type-options')=='nosniff'
    assert read.body().startswith(b'%PDF-1.4')
    assert not errors, errors
    context.clear_cookies()
    assert context.request.get(base+'/api/archive/'+str(f['docId'])).status==401
    print(json.dumps({'browser':'Chromium','realLogin':True,'secure':cookie['secure'],'httpOnly':cookie['httpOnly'],'sameSite':cookie['sameSite'],'javascriptCannotReadToken':True,'authenticatedRead':200,'withoutCookie':401,'tls':tls.get('protocol'),'pageErrors':errors},ensure_ascii=False))
    browser.close()
