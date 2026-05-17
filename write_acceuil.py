from pathlib import Path
content = '''from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import json
import os
import re
import hashlib
from datetime import datetime
import ollama
from NLP import predict_credit, explain_credit, model

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, 'users.json')
REQUESTS_FILE = os.path.join(BASE_DIR, 'requests.json')
ADMIN_EMAIL = 'admin@gmail.com'
ADMIN_DEFAULT = {'name': 'Admin', 'email': ADMIN_EMAIL, 'password': 'admin123', 'role': 'admin'}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def generate_natural_explanation(impact, result):
    # impact : liste de tuples (feature, valeur SHAP)
    impact_text = '\n'.join([f'{f}: {v:.2f}' for f, v in impact])
    
    prompt = f"""
    Explique en langage simple pourquoi un crédit a été {result} 
    pour un utilisateur avec les caractéristiques suivantes et l'impact de chaque variable :
    
    {impact_text}
    
    Écris aussi des recommandations sur ce que l'utilisateur peut améliorer pour augmenter ses chances.
    """
    
    response = ollama.chat(
        model='phi3',
        messages=[{'role': 'user', 'content': prompt}]
    )
    
    return response['message']['content']


def fix_text_data(data):
    return {
        'Gender': 'Male' if data.get('Gender') in ['Male', 'Homme'] else 'Female',
        'ApplicantIncome': float(data.get('ApplicantIncome') or 0),
        'LoanAmount': float(data.get('LoanAmount') or 0),
        'Married': 'Yes' if data.get('Married') in ['Yes', 'Married'] else 'No',
        'CreditHistory': int(data.get('CreditHistory') or 0),
        'Education': data.get('Education') or 'Not Graduate',
        'Self_Employed': data.get('Self_Employed') or 'No',
        'Loan_Amount_Term': int(data.get('Loan_Amount_Term') or 360)
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
        messages=[{'role': 'user', 'content': prompt}]
    )

    result = response['message']['content']

    clean = re.search(r'\{.*\}', result, re.DOTALL)
    if clean:
        return json.loads(clean.group())
    return {}


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return default
    return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_user(email):
    return next((u for u in users if u['email'] == email), None)


def add_request(entry):
    requests.append(entry)
    save_json(REQUESTS_FILE, requests)


def find_request(user_email: str, date: str):
    return next((r for r in requests if r['user_email'] == user_email and r['date'] == date), None)


def serialize_impact(impact):
    if not impact:
        return []
    return [[str(feature), float(value)] for feature, value in impact]


def ensure_data_files():
    global users, requests
    if not os.path.exists(USERS_FILE):
        save_json(USERS_FILE, [])
    if not os.path.exists(REQUESTS_FILE):
        save_json(REQUESTS_FILE, [])

    users = load_json(USERS_FILE, [])
    if not any(u['email'] == ADMIN_EMAIL for u in users):
        users.append({
            'name': ADMIN_DEFAULT['name'],
            'email': ADMIN_DEFAULT['email'],
            'password': hash_password(ADMIN_DEFAULT['password']),
            'role': ADMIN_DEFAULT['role']
        })
        save_json(USERS_FILE, users)

    requests = load_json(REQUESTS_FILE, [])


ensure_data_files()


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class FormRequest(BaseModel):
    Gender: str
    ApplicantIncome: float
    LoanAmount: float
    Married: str
    CreditHistory: int
    Education: str
    Self_Employed: str
    Loan_Amount_Term: int


class TextRequest(BaseModel):
    text: str


class StatusUpdateRequest(BaseModel):
    user_email: str
    date: str
    new_status: str


class ContactRequest(BaseModel):
    user_email: str
    date: str
    agency: str
    phone: str


@app.post('/login')
def login(request: LoginRequest):
    user = get_user(request.email)
    if not user or user['password'] != hash_password(request.password):
        raise HTTPException(status_code=401, detail='Email ou mot de passe incorrect.')
    return {
        'success': True,
        'user': {
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
    }


@app.post('/signup')
def signup(request: SignupRequest):
    if get_user(request.email):
        raise HTTPException(status_code=400, detail='Cet email est déjà utilisé.')
    new_user = {
        'name': request.name,
        'email': request.email,
        'password': hash_password(request.password),
        'role': 'user'
    }
    users.append(new_user)
    save_json(USERS_FILE, users)
    return {'success': True, 'message': 'Inscription réussie !'}


@app.post('/predict_form')
def predict_form(request: FormRequest):
    final_data = request.dict()
    result, proba = predict_credit(final_data)
    impact = explain_credit(model, pd.DataFrame([final_data]))
    explanation = generate_natural_explanation(impact, result)
    status = 'Pré-acceptation' if result == 'Accepté' else 'Refusé'
    recommendations = explanation
    entry = {
        'user_name': 'unknown',
        'user_email': 'unknown',
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'data': final_data,
        'result': result,
        'proba': float(proba),
        'status': status,
        'explanation': explanation,
        'impact': serialize_impact(impact),
        'recommendations': recommendations
    }
    add_request(entry)
    return {
        'result': result,
        'proba': float(proba),
        'status': status,
        'explanation': explanation,
        'impact': serialize_impact(impact),
        'recommendations': recommendations
    }


@app.post('/predict_text')
def predict_text(request: TextRequest):
    parsed = extract_with_llm(request.text)
    if not parsed:
        raise HTTPException(status_code=422, detail="Impossible d'extraire les données du texte fourni.")
    final_data = fix_text_data(parsed)
    if final_data['ApplicantIncome'] <= 0 or final_data['LoanAmount'] <= 0:
        raise HTTPException(status_code=422, detail='Extraction invalide : les valeurs de revenu et de montant doivent être valides.')
    result, proba = predict_credit(final_data)
    impact = explain_credit(model, pd.DataFrame([final_data]))
    explanation = generate_natural_explanation(impact, result)
    status = 'Pré-acceptation' if result == 'Accepté' else 'Refusé'
    recommendations = explanation
    entry = {
        'user_name': 'unknown',
        'user_email': 'unknown',
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'data': final_data,
        'result': result,
        'proba': float(proba),
        'status': status,
        'explanation': explanation,
        'impact': serialize_impact(impact),
        'recommendations': recommendations
    }
    add_request(entry)
    return {
        'result': result,
        'proba': float(proba),
        'status': status,
        'explanation': explanation,
        'impact': serialize_impact(impact),
        'recommendations': recommendations
    }


@app.get('/requests/{user_email}')
def get_requests_by_user(user_email: str):
    return [r for r in requests if r['user_email'] == user_email]


@app.get('/requests')
def get_all_requests():
    return requests


@app.patch('/requests/status')
def update_request_status(request: StatusUpdateRequest):
    entry = find_request(request.user_email, request.date)
    if not entry:
        raise HTTPException(status_code=404, detail='Demande introuvable.')
    entry['status'] = request.new_status
    save_json(REQUESTS_FILE, requests)
    return {'success': True, 'updated_status': request.new_status}


@app.post('/requests/contact')
def add_contact(request: ContactRequest):
    entry = find_request(request.user_email, request.date)
    if not entry:
        raise HTTPException(status_code=404, detail='Demande introuvable.')
    entry['contact'] = {
        'agency': request.agency,
        'phone': request.phone,
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'status': 'pending'
    }
    save_json(REQUESTS_FILE, requests)
    return {'success': True}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8501)
'''
Path('c:/Users/aya-e/OneDrive/Bureau/Python2026/Python2026/acceuil.py').write_text(content, encoding='utf-8')
