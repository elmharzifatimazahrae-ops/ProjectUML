import shap

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
import pandas as pd
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import os

# Use absolute paths based on this file's location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
df=pd.read_csv(os.path.join(BASE_DIR, "train.csv"))
rd=pd.read_csv(os.path.join(BASE_DIR, "test.csv"))

categorical = ["Gender", "Married", "Education", "Self_Employed"]
# Le CSV utilise "Credit_History" (underscore), on prépare la conversion pour le modèle
numeric = ["ApplicantIncome", "LoanAmount", "Loan_Amount_Term", "Credit_History"]

# Renommer si nécessaire pour uniformité avec l'appel depuis acceuil.py
if "Credit_History" in df.columns and "CreditHistory" not in df.columns:
    df = df.rename(columns={"Credit_History": "CreditHistory"})

# Maintenir liste features en cohérence avec le modèle (dans acceuil on utilise CreditHistory)
numeric = ["ApplicantIncome", "LoanAmount", "Loan_Amount_Term", "CreditHistory"]
features = categorical + numeric
target = "Loan_Status"

# Remplir les NaN
# Numériques → moyenne
# S'assure que les colonnes existent avant d'appliquer
numeric_existing = [c for c in numeric if c in df.columns]
df[numeric_existing] = df[numeric_existing].fillna(df[numeric_existing].mean())

# Catégorielles → valeur la plus fréquente
categorical_existing = [c for c in categorical if c in df.columns]
df[categorical_existing] = df[categorical_existing].fillna(df[categorical_existing].mode().iloc[0])

preprocessor = ColumnTransformer([
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
    ("num", "passthrough", numeric)
])

# Préparer X et y
X_train = df[features]
y_train = df[target].map({"Y": 1, "N": 0})

#Pipeline complet
model = Pipeline([
    ("preprocessing", preprocessor),
    ("classifier", RandomForestClassifier(n_estimators=100, random_state=42))
])

# Entraînement
model.fit(X_train, y_train)

def predict_credit(data_dict):
    # Transformer en DataFrame
    input_df = pd.DataFrame([data_dict])
    
    # Prédiction
    prediction = model.predict(input_df)[0]
    proba = model.predict_proba(input_df)[0][1]
    
    result_text = "Accepté" if prediction == 1 else "Refusé"
    return result_text, proba

def explain_credit(model, input_df):
    if shap is None:
        return []
    
    try:
        classifier = model.named_steps['classifier']
        preprocessor = model.named_steps['preprocessing']
        
        # Transformer l'input
        input_transformed = preprocessor.transform(input_df)
        
        # Noms des features
        cat_features = preprocessor.named_transformers_['cat']\
            .get_feature_names_out(categorical)
        all_features = (
            ['cat__' + f for f in cat_features] +
            ['num__' + n for n in numeric]
        )
        
        # SHAP
        explainer = shap.TreeExplainer(classifier)
        shap_values = explainer.shap_values(input_transformed)
        
        # RandomForest retourne un array 3D (samples, features, classes)
        # Pour la classe positive (Accepté = 1)
        if len(shap_values.shape) == 3:
            vals = shap_values[0, :, 1]  # première sample, toutes les features, classe 1
        else:
            vals = shap_values[0]  # cas improbable pour RandomForest
        
        # Associer feature → valeur SHAP
        impact = list(zip(all_features, [float(v) for v in vals]))
        
        # Trier par impact absolu décroissant
        impact.sort(key=lambda x: abs(x[1]), reverse=True)
        
        return impact[:8]
    
    except Exception as e:
        print(f"[SHAP ERROR] {e}")
        return []