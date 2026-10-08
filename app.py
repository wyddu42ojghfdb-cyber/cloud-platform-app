import streamlit as st
import streamlit.components.v1 as components
import os

st.set_page_config(page_title="Cloud Platform App", page_icon="☁️", layout="centered")

html_path = os.path.join(os.path.dirname(__file__), "index.html")

if os.path.exists(html_path):
    with open(html_path, "r", encoding="utf-8") as f:
        html_code = f.read()
    components.html(html_code, height=900, scrolling=True)
else:
    st.error("Error: index.html file not found.")
  
