import requests
import json

# Test API endpoints
endpoints = ['http://localhost:8501/docs', 'http://localhost:8501/openapi.json']
for url in endpoints:
    try:
        r = requests.get(url, timeout=5)
        print(f'{url}: {r.status_code}')
    except Exception as e:
        print(f'{url}: ERROR - {e}')

# Test prediction endpoint
try:
    data = {
        'Gender': 'Male',
        'ApplicantIncome': 5000,
        'LoanAmount': 100000,
        'Married': 'Yes',
        'CreditHistory': 1,
        'Education': 'Graduate',
        'Self_Employed': 'No',
        'Loan_Amount_Term': 360
    }
    r = requests.post('http://localhost:8501/predict_form', json=data, timeout=10)
    print(f'Prediction API: {r.status_code}')
    if r.status_code == 200:
        result = r.json()
        print(f'Prediction result: {result.get("result", "N/A")}')
except Exception as e:
    print(f'Prediction API: ERROR - {e}')