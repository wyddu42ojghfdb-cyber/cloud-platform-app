"""Optional Streamlit client for the Node API.

Set API_BASE_URL to the public origin of the Node service when Streamlit is hosted
separately. The primary installable web application is served by server.js.
"""
import json
import os
import urllib.error
import urllib.request

import streamlit as st

st.set_page_config(page_title="منظومة التداول والتحليل السحابي", page_icon="☁️", layout="centered")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:10000").rstrip("/")


def api_post(path, payload):
    request = urllib.request.Request(
        API_BASE_URL + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read().decode("utf-8")).get("error", str(error))
        except (ValueError, OSError):
            detail = str(error)
        raise RuntimeError(detail) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"تعذّر الاتصال بخادم API عند {API_BASE_URL}") from error


st.title("☁️ منظومة التداول والتحليل السحابي")
st.caption("واجهة Streamlit اختيارية؛ التطبيق الرئيسي القابل للتثبيت يقدمه server.js.")
with st.form("login"):
    username = st.text_input("اسم المستخدم", value=st.session_state.get("username", ""), max_chars=64)
    submitted = st.form_submit_button("تحميل الحساب")
if submitted:
    try:
        result = api_post("/api/user/login", {"username": username.strip()})
        st.session_state["username"] = result["user"]["username"]
        st.session_state["user"] = result["user"]
        st.success("تم تحميل بيانات الحساب.")
    except (RuntimeError, KeyError) as error:
        st.error(str(error))

user = st.session_state.get("user")
if user:
    st.metric("رأس المال", f"USDT {float(user.get('balance', 0)):.2f}")
    st.metric("الأرباح اليومية", f"USDT {float(user.get('todayProfit', 0)):.2f}")
    st.metric("عمولات الإحالة", f"USDT {float(user.get('bonus', 0)):.2f}")
    st.caption("الطلبات التالية تُسجّل للمراجعة فقط؛ لا تنفذ هذه الواجهة تحويلاً مالياً.")
    with st.form("request"):
        request_type = st.selectbox("نوع الطلب", ["deposit", "withdraw_daily", "invite_bonus", "withdraw_capital"])
        amount = st.number_input("المبلغ (USDT)", min_value=0.01, step=0.01)
        wallet = st.text_input("محفظة السحب (إن لزم)", max_chars=128)
        send = st.form_submit_button("إرسال للمراجعة")
    if send:
        try:
            api_post("/api/user/request", {"username": st.session_state["username"], "type": request_type, "amount": amount, "walletAddress": wallet.strip()})
            st.success("تم تسجيل الطلب للمراجعة.")
        except RuntimeError as error:
            st.error(str(error))
