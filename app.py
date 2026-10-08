import streamlit as st
import streamlit.components.v1 as components

# 1. إعدادات المنصة العالمية الملونة لمنع خمول المتصفح
st.set_page_config(page_title="Cloud Platform App", page_icon="☁️", layout="centered")

st.markdown("<h3 style='text-align: center; color: #38bdf8;'>☁️ منظومة محاكي التداول الذكي والتحليل السحابي</h3>", unsafe_allowed_html=True)

# 🌐 هذا هو السطر السحري والأهم: تحديد عنوان السيرفر المحلي للشاشة السوداء لـ Termux
# يتم تمرير الطلبات المالية والأسماء عبر الـ localhost لتصب داخل السيرفر المفتوح على المنفذ 3000
LOCAL_SERVER_URL = "http://localhost:3000"

# 2. بناء الواجهة العربية الملونة والفاخرة بـ 5 لغات بربط مباشر وصافٍ للسيرفر المحلي
html_code = f"""
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {{
            --bg-color: #0b1426; --card-bg: #111c33; --input-bg: #090f1d;
            --blue-btn: #1a56db; --purple-btn: #7e3af2; --orange-btn: #ea580c;
            --red-btn: #dc2626; --green-btn: #16a34a; --cyan-btn: #06b6d4;
            --text-color: #ffffff; --text-muted: #9ca3af; --border-color: #1e293b;
        }}
        body {{ font-family: sans-serif; background-color: var(--bg-color); color: var(--text-color); margin: 0; padding: 10px; display: flex; justify-content: center; }}
        .container {{ width: 100%; max-width: 480px; background-color: var(--card-bg); border-radius: 12px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid var(--border-color); }}
        .lang-bar {{ display: flex; justify-content: space-between; margin-bottom: 15px; gap: 4px; }}
        .lang-btn {{ flex: 1; padding: 6px 2px; font-size: 11px; background-color: #1e293b; border: 1px solid var(--border-color); color: white; border-radius: 4px; cursor: pointer; font-weight: bold; }}
        .lang-btn.active {{ background-color: var(--blue-btn); }}
        .header {{ text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 20px; color: #38bdf8; }}
        .section {{ background-color: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; margin-bottom: 15px; }}
        label {{ display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }}
        input {{ width: 100%; background-color: var(--input-bg); border: 1px solid var(--border-color); color: white; padding: 10px; border-radius: 6px; box-sizing: border-box; text-align: center; font-size: 14px; margin-bottom: 10px; }}
        button {{ width: 100%; padding: 12px; border: none; border-radius: 6px; color: white; font-weight: bold; font-size: 14px; cursor: pointer; margin-bottom: 8px; }}
        .btn-blue {{ background-color: var(--blue-btn); }}
        .btn-purple {{ background-color: var(--purple-btn); }} .btn-red {{ background-color: var(--red-btn); }}
        .btn-green {{ background-color: var(--green-btn); }}
        .stats-row {{ display: flex; justify-content: space-between; font-size: 14px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }}
        .value {{ color: #a855f7; font-weight: bold; }}
        .info-text {{ font-size: 12px; color: #fbbf24; text-align: center; margin-bottom: 8px; }}
        .wallet-box {{ font-family: monospace; background-color: var(--input-bg); padding: 10px; border-radius: 6px; text-align: center; font-size: 13px; color: #4ade80; border: 1px dashed #4ade80; margin-bottom: 10px; }}
        .history-item {{ display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 8px; background: rgba(0,0,0,0.2); margin-bottom: 6px; border-radius: 4px; border-right: 3px solid #38bdf8; }}
        .history-date {{ font-family: monospace; color: #9ca3af; font-size: 11px; }}
    </style>
</head>
<body>
<div class="container">
    <div class="lang-bar">
        <button id="ln-ar" class="lang-btn active" onclick="changeLang('ar')">العربية</button>
        <button id="ln-en" class="lang-btn" onclick="changeLang('en')">English</button>
        <button id="ln-tr" class="lang-btn" onclick="changeLang('tr')">Türkçe</button>
    </div>
    <div class="header" id="txt-header">☁️ منظومة محاكي التداول الذكي والتحليل السحابي</div>
    
    <div class="section">
        <label id="user-label">👤 اسم المستخدم الحالي: (غير مسجل)</label>
        <input type="text" id="username-input" placeholder="اكتب اسمك هنا لبدء البث حياً">
        <button class="btn-blue" id="btn-save-name" onclick="handleLogin()">💾 إرسال طلب حفظ الاسم للمشرف</button>
    </div>

    <div class="section">
        <div class="info-text" id="txt-grand-prize">👑 جائزة الكبرى (40 عضو) <br> 2500 دولار أمريكي</div>
        <div class="stats-row"><span id="txt-team-label">أعضاء الفريق النشطين:</span><span id="team-count" class="value" style="color:#eab308;">0/40</span></div>
    </div>

    <div class="section">
        <label id="txt-invite-label">🔗 إرسال طلب مكافأة الإحالة (الدعوة المباشرة):</label>
        <input type="text" id="invite-name" placeholder="اسم الصديق المدعو">
        <button class="btn-purple" id="btn-invite" onclick="sendInviteBonus()">🍇 إرسال المكافأة إلى المشرف</button>
    </div>

    <div class="section">
        <div class="stats-row"><span id="txt-capital">إجمالي رأس المال:</span><span id="balance-val" class="value">USDT 0.00</span></div>
        <div class="stats-row"><span id="txt-profit">الأرباح اليومية:</span><span id="profit-val" class="value">USDT 0.00</span></div>
        <div class="stats-row"><span id="txt-bonus">أرباح الدعوة والمكافآت:</span><span id="bonus-val" class="value" style="color: #22c55e;">USDT 0.00</span></div>
    </div>

    <div class="section" style="border-color: var(--red-btn);">
        <div class="info-text" id="txt-withdraw-header" style="color: var(--red-btn);">🚨 بوابة السحب الفوري المباشر (شبكة TRC-20)</div>
        <input type="text" id="withdraw-wallet" placeholder="أدخل عنوان محفظة TRC-20 الخاصة بك">
        <input type="number" id="withdraw-profit-amount" placeholder="مبلغ سحب أرباح اليوم">
        <button class="btn-red" id="btn-w-profit" onclick="sendWithdraw('withdraw_daily')">📊 سحب أرباح اليوم</button>
        <input type="number" id="withdraw-capital-amount" placeholder="مبلغ سحب الرصيد الكلي">
        <button class="btn-red" id="btn-w-capital" style="background-color: #991b1b;" onclick="sendWithdraw('withdraw_capital')">💥 سحب إجمالي الرصيد الكلي</button>
    </div>

    <div class="section" style="border-color: var(--green-btn);">
        <div class="info-text" id="txt-deposit-header" style="color: var(--green-btn);"> محفظة الإيداع الرسمية - شبكة USDT (TRC-20)</div>
        <div class="wallet-box" id="company-wallet">TA1vsgrJEfy3YM6rkQWbppnZemFE6c9pBN</div>
        <input type="number" id="deposit-amount" placeholder="أدخل مبلغ الشحن بـ USDT">
        <button class="btn-green" id="btn-deposit" onclick="sendDeposit()">⚡ إرسال طلب الإيداع للمشرف</button>
    </div>

    <div class="section" style="border-color: #38bdf8;">
        <div class="info-text" id="txt-history-header" style="color: #38bdf8; font-weight: bold; text-align: right;">📋 سجل المعاملات وإشعارات الحساب الحية:</div>
        <div id="history-box-container">
            <div style="color: var(--text-muted); text-align: center; font-size: 12px; padding: 10px;">لا توجد إشعارات حية حالياً..</div>
        </div>
    </div>
</div>

<script>
    let currentUsername = localStorage.getItem('trader_username') || '';
    let currentLang = 'ar';
    // تمرير الرابط المحلي للشاشة السوداء بدقة لقفل الاختراق البرمجي
    const API_BASE = "{LOCAL_SERVER_URL}";

    if (currentUsername) {{ document.getElementById('username-input').value = currentUsername; setInterval(fetchUserData, 3000); }}

    function handleLogin() {{
        const username = document.getElementById('username-input').value.trim(); if (!username) return alert('Username required');
        fetch(API_BASE + '/api/user/login', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify({{ username }}) }}).then(res => res.json()).then(data => {{ if (data.success) {{ localStorage.setItem('trader_username', username); window.location.reload(); }} }});
    }}
    
    function fetchUserData() {{
        if (!currentUsername) return;
        fetch(API_BASE + '/api/user/login', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify({{ username: currentUsername }}) }}).then(res => res.json()).then(data => {{
            if (data.success) {{
                const u = data.user;
                document.getElementById('balance-val').innerText = 'USDT ' + u.balance.toFixed(2);
                document.getElementById('profit-val').innerText = 'USDT ' + u.todayProfit.toFixed(2);
                document.getElementById('bonus-val').innerText = 'USDT ' + u.bonus.toFixed(2);
                document.getElementById('team-count').innerText = u.teamCount + '/40';
            }}
        }});
    }}

    function sendDeposit() {{
        const amount = document.getElementById('deposit-amount').value; if (!currentUsername) return alert('Save username first');
        fetch(API_BASE + '/api/user/request', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify({{ username: currentUsername, amount, type: 'deposit', walletAddress: 'TA1vsgrJEfy3YM6rkQWbppnZemFE6c9pBN' }}) }}).then(res => res.json()).then(data => {{ if(data.success) alert('تم إرسال طلب الشحن بنجاح وينتظر شاشتك السوداء!'); }});
    }}

    function sendWithdraw(type) {{
        if (!currentUsername) return alert('Save username first'); const wallet = document.getElementById('withdraw-wallet').value.trim(); if (!wallet) return alert('Wallet required');
        let amount = type === 'withdraw_daily' ? document.getElementById('withdraw-profit-amount').value : document.getElementById('withdraw-capital-amount').value;
