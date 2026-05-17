import streamlit as st
import ollama
import json
import re 
import pandas as pd
from NLP import predict_credit, explain_credit, model


def generate_natural_explanation(impact, result):
    # impact : liste de tuples (feature, valeur SHAP)
    impact_text = "\n".join([f"{f}: {v:.2f}" for f, v in impact])
    
    prompt = f"""
    Explique en langage simple pourquoi un crédit a été {result} 
    pour un utilisateur avec les caractéristiques suivantes et l'impact de chaque variable :
    
    {impact_text}
    
    Écris aussi des recommandations sur ce que l'utilisateur peut améliorer pour augmenter ses chances.
    """
    
    response = ollama.chat(
        model='phi3',
        messages=[{"role": "user", "content": prompt}]
    )
    
    return response['message']['content']

def fix_text_data(data):
    return {
        "Gender": "Male" if data.get("Gender") in ["Male", "Homme"] else "Female",
        "ApplicantIncome": float(data.get("ApplicantIncome") or 0),
        "LoanAmount": float(data.get("LoanAmount") or 0),
        "Married": "Yes" if data.get("Married") in ["Yes", "Married"] else "No",
        "CreditHistory": int(data.get("CreditHistory") or 0),
        "Education": data.get("Education") or "Not Graduate",
        "Self_Employed": data.get("Self_Employed") or "No",
        "Loan_Amount_Term": int(data.get("Loan_Amount_Term") or 360)
    }

def extract_with_llm(text):
    prompt = f"""
    Extrais les informations suivantes du texte et retourne un JSON :
     Retourne UNIQUEMENT un JSON valide sans explication.
     ⚠️ Règles STRICTES :
    - Ne devine rien
    - Si une information est absente → mettre null
    
    - Gender (Male ou Female)
    - ApplicantIncome (nombre)
    - LoanAmount (nombre)
    - Married (Yes ou No)
    - CreditHistory (1 ou 0)
    - Education (Graduate ou Not Graduate)
    - Self_Employed (Yes ou No)
    - Loan_Amount_Term (nombre en mois)
    

    Texte : {text}

    Répond uniquement en JSON.
    """

    response = ollama.chat(
        model='phi3',
        messages=[{"role": "user", "content": prompt}]
    )

    result = response['message']['content']

    clean = re.search(r'\{.*\}', result, re.DOTALL)
    if clean:
        return json.loads(clean.group())
       
    return {}

import os
from datetime import datetime

# Styles globaux
st.markdown("""
<style>
body {
    background-color: #f5f7fa;
    color: #333;
    font-family: 'Roboto', 'Open Sans', sans-serif;
}
.css-1d391kg {background-color: #f5f7fa;}
.stButton>button {
    background-color: #4a90e2;
    color: white;
    border-radius: 8px;
    border: none;
    padding: 0.6rem 1rem;
    transition: background-color 0.2s ease;
}
.stButton>button:hover {
    background-color: #3b7ad1;
}
.stTextInput>div>input, .stSelectbox>div>div>div>span, .stTextArea>div>textarea {
    border: 1px solid #d8dce4;
    border-radius: 8px;
}
</style>
""", unsafe_allow_html=True)

USERS_FILE = "users.json"
REQUESTS_FILE = "requests.json"
ADMIN_EMAIL = "admin@gmail.com"
ADMIN_DEFAULT = {"name": "Admin", "email": ADMIN_EMAIL, "password": "admin123", "role": "admin"}

import hashlib

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default
    return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


users = load_json(USERS_FILE, [])
if not any(u["email"] == ADMIN_EMAIL for u in users):
    users.append(ADMIN_DEFAULT)
    save_json(USERS_FILE, users)

requests = load_json(REQUESTS_FILE, [])


def get_user(email):
    return next((u for u in users if u["email"] == email), None)


def add_request(entry):
    requests.append(entry)
    save_json(REQUESTS_FILE, requests)


if "user" not in st.session_state:
    st.session_state.user = None


# Page login/inscription
if st.session_state.user is None:
    st.markdown("## Connexion / Inscription")
    tab1, tab2 = st.tabs(["Connexion", "Inscription"])

    with tab1:
        login_email = st.text_input("Email Gmail", value="", placeholder="exemple@gmail.com", key="login_email")
        login_password = st.text_input("Mot de passe", type="password", key="login_password")

        if st.button("Se connecter", key="login_button"):
            if not re.match(r"^[a-zA-Z0-9._%+-]+@gmail\.com$", login_email):
                st.error("Veuillez utiliser une adresse Gmail valide.")
            else:
                user = get_user(login_email)
                if user and user["password"] == hash_password(login_password):
                    st.success("Connexion réussie")
                    st.session_state.user = user
                    st.rerun()
                else:
                    st.error("Email ou mot de passe incorrect.")

    with tab2:
        signup_name = st.text_input("Nom", key="signup_name")
        signup_email = st.text_input("Email ou Gmail", key="signup_email")
        signup_password = st.text_input("Mot de passe", type="password", key="signup_password")

        if st.button("S’inscrire", key="signup_button"):
            if not signup_name or not signup_email or not signup_password:
                st.error("Tous les champs sont requis")
            elif not re.match(r"^[a-zA-Z0-9._%+-]+@gmail\.com$", signup_email):
                st.error("Veuillez utiliser une adresse Gmail valide.")
            elif get_user(signup_email):
                st.error("Cet email est déjà utilisé.")
            else:
                new_user = {
                "name": signup_name,
                "email": signup_email,
                "password": hash_password(signup_password),
                "role": "user"
                        }
                users.append(new_user)
                save_json(USERS_FILE, users)
                st.success("Inscription réussie ! Connectez-vous maintenant.")

else:
    user = st.session_state.user
    st.sidebar.markdown(f"### Bonjour {user['name']}\n**{user['email']}**")
    st.sidebar.button("Se déconnecter", on_click=lambda: st.session_state.update({'user': None}) or st.rerun())

    if user["role"] == "admin":
        st.title("Dashboard Admin")

        # Statistiques générales
        total = len(requests)
        accepted = sum(1 for r in requests if r["status"] == "Accepté")
        refused = sum(1 for r in requests if r["status"] == "Refusé")
        pre = sum(1 for r in requests if r["status"] == "Pré-acceptation")

        cols = st.columns(3)
        cols[0].metric("Demandes totales", total)
        cols[1].metric("Acceptées", accepted)
        cols[2].metric("Refusées", refused)

        if total > 0:
            st.subheader("Taux d'acceptation")
            st.progress(int((accepted / total) * 100))

        # Graphique SHAP top features
        shaps = {}
        for r in requests:
            if "impact" in r and isinstance(r["impact"], list):
                for f, _ in r["impact"]:
                    shaps[f] = shaps.get(f, 0) + 1

        if shaps:
            chart_df = pd.DataFrame.from_dict(shaps, orient='index', columns=['count']).sort_values('count', ascending=False)
            st.bar_chart(chart_df)

        st.subheader("Demandes en attente de confirmation (Pré-acceptées)")
        pending_requests = [r for r in requests if r["status"] == "Pré-acceptation"]

        if pending_requests:
            table_data = []
            for idx, r in enumerate(pending_requests):
                table_data.append({
                    "#": idx + 1,
                    "Utilisateur": r["user_name"],
                    "Email": r["user_email"],
                    "Décision AI": r["result"],
                    "Statut": r["status"],
                    "Probabilité": f"{r['proba']:.2f}",
                    "Date": r["date"]
                })
            st.dataframe(pd.DataFrame(table_data), use_container_width=True)

            st.markdown("---")
            for idx, r in enumerate(pending_requests):
                color = "#f1c40f"
                with st.expander(f"{idx+1}. {r['user_name']} - {r['status']}"):
                    st.markdown(f"<div style='padding:10px; border-left:8px solid {color}; background:#fff; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.07);'>", unsafe_allow_html=True)
                    st.write(r["data"])
                    st.write("**Explication AI**:", r.get("explanation", "---"))
                    st.write("**Impact Top5**:", r.get("impact", []))
                    st.markdown("</div>", unsafe_allow_html=True)
                    decision = st.radio("Décision admin", ["Aucune", "Accepté", "Refusé"], key=f"admin_decision_{idx}")
                    if st.button("Valider décision", key=f"admin_apply_{idx}"):
                        if decision == "Accepté":
                            for i, req in enumerate(requests):
                                if req["date"] == r["date"] and req["user_email"] == r["user_email"]:
                                    requests[i]["status"] = "Accepté"
                                    break
                        elif decision == "Refusé":
                            for i, req in enumerate(requests):
                                if req["date"] == r["date"] and req["user_email"] == r["user_email"]:
                                    requests[i]["status"] = "Refusé"
                                    break
                        save_json(REQUESTS_FILE, requests)
                        st.success("Décision mise à jour")
                        st.rerun()

        else:
            st.info("Aucune demande pré-acceptée n'attend de confirmation.")

    else:
        st.title("Demande de crédit")

        user_requests = [r for r in requests if r["user_email"] == user["email"]]
        if user_requests:
            last = user_requests[-1]
            status_color = "#27ae60" if last["status"] == "Accepté" else "#e74c3c" if last["status"] == "Refusé" else "#f1c40f"
            st.markdown(f"<div style='border-left:6px solid {status_color}; padding:10px; border-radius:8px; background:#fff;'>")
            st.write("Dernière demande :")
            st.write(f"**Statut** : {last['status']}")
            st.write(f"**Probabilité** : {last['proba']:.2f}")
            st.write(f"**Explication** : {last.get('explanation','---')}")
            st.markdown(f"<p style='font-style: italic; color:#555;'>Suggestion : {last.get('recommendations','---')}</p>")
            st.markdown("</div>", unsafe_allow_html=True)

        tabA, tabB = st.tabs(["Formulaire", "Texte"])

        final_data = None

        with tabA:
            Gender = st.selectbox("Genre", ["Male", "Female"])
            salary = st.number_input("Salaire", min_value=0.0, step=500.0)
            loan = st.number_input("Montant du crédit", min_value=0.0, step=100.0)
            marital = st.selectbox("Situation familiale", ["Single", "Married"])
            credit_history = st.selectbox("Historique crédit", ["Bon", "Mauvais"])
            Education = st.selectbox("Niveau d'éducation", ["Graduate", "Not Graduate"])
            Self_Employed = st.selectbox("Auto-entrepreneur", ["Yes", "No"])
            Loan_Amount_Term = st.number_input("Durée du crédit (en mois)", min_value=0, step=12, value=360)

            if st.button("Soumettre la demande"):
                final_data = {
                    "Gender": Gender,
                    "ApplicantIncome": salary,
                    "LoanAmount": loan,
                    "Married": "Yes" if marital == "Married" else "No",
                    "CreditHistory": 1 if credit_history == "Bon" else 0,
                    "Education": Education,
                    "Self_Employed": Self_Employed,
                    "Loan_Amount_Term": Loan_Amount_Term
                }

        with tabB:
            text = st.text_area("Décris ta situation (min 20 caractères)")
            if st.button("Soumettre la demande en texte"):
                if len(text.strip()) < 20:
                    st.error("Veuillez fournir une description plus détaillée.")
                else:
                    parsed = extract_with_llm(text)
                    final_data = fix_text_data(parsed)

        if final_data is not None:
            result, proba = predict_credit(final_data)
            impact = explain_credit(model, pd.DataFrame([final_data]))
            explanation = generate_natural_explanation(impact, result)

            if result == "Accepté":
                status = "Pré-acceptation"  # OK si admin valide après
            else:
                status = "Refusé"

            recommendations = explanation

            entry = {
                "user_name": user["name"],
                "user_email": user["email"],
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "data": final_data,
                "result": result,
                "proba": proba,
                "status": status,
                "explanation": explanation,
                "impact": impact,
                "recommendations": recommendations
            }
            add_request(entry)

            if status == "Accepté":
                status_color = "#27ae60"
            elif status == "Refusé":
                status_color = "#e74c3c"
            else:
                status_color = "#f1c40f"

            st.success(f"Résultat : {result} ({proba:.2f})")
            st.markdown(f"<div style='border-radius:8px; border:1px solid #d8dce4; background:#fff; padding:12px; margin-top: 8px;'>")
            st.markdown(f"<h4 style='color:{status_color};'>Status : {status}</h4>")
            st.write("**Explication**")
            st.write(explanation)
            st.write("**Top features**")
            st.write(impact)
            st.markdown("</div>", unsafe_allow_html=True)

            st.info("Vous pouvez modifier votre demande et soumettre une nouvelle demande à tout moment.")

