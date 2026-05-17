from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import json
import os
import re
import hashlib
from datetime import datetime, timedelta
import ollama
from NLP import predict_credit, explain_credit, model

# Change working directory to script location
os.chdir(os.path.dirname(os.path.abspath(__file__)))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, 'users.json')
REQUESTS_FILE = os.path.join(BASE_DIR, 'requests.json')
ADMIN_EMAIL = 'admin@gmail.com'
ADMIN_DEFAULT = {'name': 'Admin', 'email': ADMIN_EMAIL, 'password': 'admin123', 'role': 'admin'}

# Champs requis avec valeurs par défaut et labels lisibles
REQUIRED_FIELDS = {
    'Gender':           {'default': 'Male',         'label': 'Genre'},
    'ApplicantIncome':  {'default': 0,              'label': 'Salaire mensuel'},
    'LoanAmount':       {'default': 0,              'label': 'Montant du crédit'},
    'Married':          {'default': 'No',           'label': 'Situation familiale'},
    'CreditHistory':    {'default': 1,              'label': 'Historique de crédit'},
    'Education':        {'default': 'Not Graduate', 'label': 'Niveau d\'éducation'},
    'Self_Employed':    {'default': 'No',           'label': 'Auto-entrepreneur'},
    'Loan_Amount_Term': {'default': 360,            'label': 'Durée de remboursement'}
}

# Champs critiques : si manquants, la prédiction est peu fiable
CRITICAL_FIELDS = ['ApplicantIncome', 'LoanAmount']

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def generate_shap_explanation_refus(impact, user_data):
    """
    Génère une explication détaillée UNIQUEMENT en cas de refus.
    Basée sur les valeurs SHAP réelles.
    Retourne une string formatée.
    """
    if not impact:
        return (
            "Votre demande a été refusée suite à l'analyse automatique de votre dossier. "
            "Les critères généraux d'éligibilité n'ont pas été satisfaits. "
            "Nous vous conseillons de contacter un conseiller pour plus de détails."
        )

    # Normaliser : accepter tuples ET listes [[f,v]] ou [(f,v)]
    normalized = []
    for item in impact:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            normalized.append((str(item[0]), float(item[1])))

    if not normalized:
        return "Analyse effectuée. Dossier non conforme aux critères d'éligibilité."

    # Mapping noms lisibles
    FEATURE_LABELS = {
        'num__ApplicantIncome':          'Revenus mensuels',
        'num__LoanAmount':               'Montant du crédit demandé',
        'num__Loan_Amount_Term':         'Durée de remboursement',
        'num__CreditHistory':            'Historique de crédit',
        'cat__Gender_Male':              'Genre',
        'cat__Gender_Female':            'Genre',
        'cat__Married_Yes':              'Situation familiale (marié)',
        'cat__Married_No':               'Situation familiale (célibataire)',
        'cat__Education_Graduate':       'Niveau d\'éducation (diplômé)',
        'cat__Education_Not Graduate':   'Niveau d\'éducation (non diplômé)',
        'cat__Self_Employed_Yes':        'Statut (auto-entrepreneur)',
        'cat__Self_Employed_No':         'Statut (salarié)',
    }

    # Conseils personnalisés par feature
    CONSEILS = {
        'num__ApplicantIncome': (
            f"Vos revenus mensuels ({user_data.get('ApplicantIncome', '?')} €) "
            f"sont insuffisants par rapport au montant demandé "
            f"({user_data.get('LoanAmount', '?')} €). "
            f"Conseil : réduisez le montant demandé ou augmentez vos revenus "
            f"avant de soumettre une nouvelle demande."
        ),
        'num__LoanAmount': (
            f"Le montant demandé ({user_data.get('LoanAmount', '?')} €) "
            f"est trop élevé par rapport à votre profil financier. "
            f"Conseil : réduisez le montant ou augmentez la durée de remboursement."
        ),
        'num__CreditHistory': (
            "Conseil : régularisez vos dettes existantes, évitez les incidents "
            "de paiement pendant au moins 6 mois avant de soumettre une nouvelle demande."
        ),
        'num__Loan_Amount_Term': (
            f"La durée choisie ({user_data.get('Loan_Amount_Term', '?')} mois) "
            f"génère des mensualités trop élevées. "
            f"Conseil : allongez la durée de remboursement pour réduire vos mensualités."
        ),
        'cat__Self_Employed_Yes': (
            "Votre statut d'auto-entrepreneur représente un facteur de risque. "
            "Conseil : fournissez des justificatifs de revenus stables sur 2 ans "
            "et un bilan comptable pour renforcer votre dossier."
        ),
        'cat__Education_Not Graduate': (
            "Votre niveau d'éducation impacte légèrement votre score. "
            "Conseil : valorisez votre expérience professionnelle "
            "et vos revenus dans votre dossier."
        ),
        'cat__Married_No': (
            "Votre situation de célibataire peut être un facteur mineur. "
            "Conseil : fournissez une garantie supplémentaire ou un co-emprunteur."
        ),
    }

    # Filtrer doublons one-hot encoding
    seen_bases = set()
    filtered = []
    for feature, value in sorted(normalized, key=lambda x: abs(x[1]), reverse=True):
        if feature.startswith('cat__'):
            base = '_'.join(feature.replace('cat__', '').split('_')[:1])
            if base in seen_bases:
                continue
            seen_bases.add(base)
        filtered.append((feature, value))

    # Calculer le total absolu pour les pourcentages
    total_impact = sum(abs(value) for feature, value in filtered)

    # Séparer positifs et négatifs
    negatifs = [(f, v) for f, v in filtered if v < 0]
    positifs = [(f, v) for f, v in filtered if v >= 0]

    # ── Construire le message ─────────────────────────────────
    lines = []

    lines.append("ANALYSE DÉTAILLÉE DE VOTRE DEMANDE DE CRÉDIT")
    lines.append("=" * 50)
    lines.append("")
    lines.append("Résultat : DEMANDE REFUSÉE")
    lines.append("")
    lines.append("Voici l'analyse détaillée des facteurs qui ont influencé cette décision :")
    lines.append("")

    # Facteurs défavorables (principales raisons du refus)
    if negatifs:
        lines.append("🔴 FACTEURS DÉFAVORABLES (raisons principales du refus)")
        lines.append("-" * 55)
        lines.append("")

        for i, (feature, value) in enumerate(negatifs[:5], 1):
            label = FEATURE_LABELS.get(feature, feature)
            percentage = (abs(value) / total_impact * 100) if total_impact > 0 else 0

            lines.append(f"{i}. {label}")
            lines.append(f"   • Contribution au refus : {percentage:.1f}%")
        

            # Conseil personnalisé
            conseil = CONSEILS.get(feature)
            if conseil:
                lines.append(f"   • {conseil}")

            lines.append("")

    # Facteurs favorables (points positifs)

    # Analyse financière détaillée
    lines.append(" ANALYSE FINANCIÈRE DÉTAILLÉE")
    lines.append("-" * 35)
    lines.append("")

    income = user_data.get('ApplicantIncome', 0)
    loan = user_data.get('LoanAmount', 0)
    term = user_data.get('Loan_Amount_Term', 360)

    if income > 0 and loan > 0 and term > 0:
        mensualite = loan / term
        ratio = (mensualite / income) * 100

        lines.append(f"• Revenus mensuels : {income:.0f} €")
        lines.append(f"• Montant du crédit : {loan:.0f} €")
        lines.append(f"• Durée : {term:.0f} mois")
        lines.append(f"• Mensualité calculée : {mensualite:.0f} €/mois")
        lines.append(f"• Ratio mensualité/revenus : {ratio:.1f}%")
        lines.append("")

        if ratio > 33:
            lines.append("⚠️  ATTENTION : Ce ratio dépasse le seuil recommandé de 33%.")
            lines.append("   Cela signifie que vos mensualités représenteraient plus du tiers de vos revenus.")
            lines.append("   Conseil : Réduisez le montant demandé ou allongez la durée.")
        else:
            lines.append("✅ BON POINT : Ce ratio est dans les normes acceptables (≤ 33%).")
            lines.append("   Cependant, d'autres facteurs ont conduit au refus.")

        lines.append("")

    return "\n".join(lines)


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


def is_weekend(date):
    """Vérifie si une date est un week-end"""
    return date.weekday() >= 5  # 5 = samedi, 6 = dimanche


def get_next_business_day(start_date, days_ahead=1):
    """Retourne le prochain jour ouvré"""
    current_date = start_date
    while days_ahead > 0:
        current_date += timedelta(days=1)
        if not is_weekend(current_date):
            days_ahead -= 1
    return current_date


def get_available_slots():
    """Retourne les créneaux horaires disponibles"""
    return ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']


def find_available_appointment(agency, start_date=None):
    """
    Trouve le prochain créneau disponible pour une agence
    Vérifie les collisions avec les rendez-vous existants
    """
    if start_date is None:
        start_date = datetime.now()

    # Chercher dans les 1-2 jours ouvrés
    for days_ahead in [1, 2]:
        check_date = get_next_business_day(start_date, days_ahead)

        # Pour chaque créneau horaire
        for time_slot in get_available_slots():
            # Vérifier si ce créneau est libre pour cette agence
            is_available = True
            for request in requests:
                if (request.get('appointment') and
                    request['appointment']['agency'] == agency and
                    request['appointment']['date'] == check_date.strftime('%Y-%m-%d') and
                    request['appointment']['time'] == time_slot and
                    request['appointment']['status'] == 'confirmed'):
                    is_available = False
                    break

            if is_available:
                return {
                    'date': check_date.strftime('%Y-%m-%d'),
                    'time': time_slot,
                    'agency': agency
                }

    # Si aucun créneau trouvé dans 2 jours, prendre le premier disponible dans 3 jours
    check_date = get_next_business_day(start_date, 3)
    return {
        'date': check_date.strftime('%Y-%m-%d'),
        'time': get_available_slots()[0],  # Premier créneau du matin
        'agency': agency
    }


def generate_appointment(entry):
    """Génère un rendez-vous pour une demande confirmée"""
    if not entry.get('contact') or entry['contact']['status'] != 'confirmed':
        return None

    contact = entry['contact']
    appointment_slot = find_available_appointment(contact['agency'])

    appointment = {
        'user_name': entry['user_name'],
        'user_email': entry['user_email'],
        'agency': contact['agency'],
        'date': appointment_slot['date'],
        'time': appointment_slot['time'],
        'phone': contact['phone'],
        'status': 'confirmed',
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

    return appointment


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
    user_name: str = 'unknown'
    user_email: str = 'unknown'


class StatusUpdateRequest(BaseModel):
    user_email: str
    date: str
    new_status: str


class ContactRequest(BaseModel):
    user_email: str
    date: str
    agency: str
    phone: str


class ConfirmContactRequest(BaseModel):
    user_email: str
    date: str


class Appointment(BaseModel):
    user_name: str
    user_email: str
    agency: str
    date: str
    time: str
    phone: str
    status: str = 'confirmed'


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
    try:
        final_data = request.dict()
        result, proba = predict_credit(final_data)

        # Générer les explications SHAP
        input_df = pd.DataFrame([final_data])
        impact = explain_credit(model, input_df)
        serial_impact = serialize_impact(impact)
        status = 'Pré-acceptation' if result == 'Accepté' else 'Refusé'

        # Explication SHAP uniquement en cas de refus
        if result == 'Refusé':
            explanation = generate_shap_explanation_refus(impact, final_data)
        else:
            # Cas accepté : message simple et positif
            explanation = (
                f"Félicitations ! Votre dossier a été analysé favorablement. "
                f"Votre profil financier correspond aux critères d'éligibilité "
                f"avec une probabilité d'acceptation de {round(proba * 100)}%. "
                f"Un conseiller vous contactera pour finaliser votre demande."
            )

        entry = {
            'user_name': final_data.pop('user_name', 'unknown'),
            'user_email': final_data.pop('user_email', 'unknown'),
            'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'data': final_data,
            'result': result,
            'proba': float(proba),
            'status': status,
            'explanation': explanation,   # ← toujours une string propre
            'impact': serial_impact,      # ← toujours [[f, v], ...]
            'recommendations': explanation
        }
        add_request(entry)

        return {
            'result': result,
            'proba': float(proba),
            'status': status,
            'explanation': explanation,
            'impact': serial_impact,
            'recommendations': explanation
        }
    except Exception as e:
        import traceback
        return {'error': str(e), 'traceback': traceback.format_exc()}


@app.get('/requests/{user_email}')
def get_requests_by_user(user_email: str):
    return [r for r in requests if r['user_email'] == user_email]


@app.get('/requests')
def get_all_requests():
    return requests


@app.get('/last-request/{user_email}')
def get_last_request(user_email: str):
    """Retourne la dernière demande de l'utilisateur pour pré-remplir le formulaire"""
    user_requests = [r for r in requests if r['user_email'] == user_email]
    if user_requests:
        return user_requests[-1]['data']
    return {}


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


@app.post('/requests/confirm-contact')
def confirm_contact(request: ConfirmContactRequest):
    """Confirme le contact et génère automatiquement un rendez-vous"""
    entry = find_request(request.user_email, request.date)
    if not entry:
        raise HTTPException(status_code=404, detail='Demande introuvable.')

    if not entry.get('contact'):
        raise HTTPException(status_code=400, detail='Aucun contact en attente.')

    # Confirmer le contact
    entry['contact']['status'] = 'confirmed'
    entry['status'] = 'Finalisé'  # Passer à l'état finalisé

    # Générer le rendez-vous
    appointment = generate_appointment(entry)
    if appointment:
        entry['appointment'] = appointment

    save_json(REQUESTS_FILE, requests)
    return {
        'success': True,
        'appointment': appointment,
        'message': 'Contact confirmé et rendez-vous généré automatiquement.'
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
uvicorn.run(app, host="0.0.0.0", port=port)

