import ollama
import json
import re 

def extract_with_llm(text):
    prompt = f"""
    Extrais les informations suivantes du texte et retourne un JSON :
     Retourne UNIQUEMENT un JSON valide sans explication.
     ⚠️ Règles STRICTES :
    - Ne devine rien
    - Si une information est absente → mettre null
    
    - Gender (Homme ou Femme)
    - Salary (nombre)
    - LoanAmount (nombre)
    - MaritalStatus (Married ou Single)
    - CreditHistory (1 ou 0)
    - Education (Graduate ou Not Graduate)
    - Self_Employed (Yes ou No)
    - Loan_Amount_Term (nombre en mois)
    

    Texte : {text}

    Répond uniquement en JSON.
    """

    response = ollama.chat(
        model='llama3',
        messages=[{"role": "user", "content": prompt}]
    )

    result = response['message']['content']

    clean = re.search(r'\{.*\}', result, re.DOTALL)
    if clean:
        return json.loads(clean.group())
       
    return {}
text = "أنا امرأة، راتبي 7000 درهم، أريد قرض 20000، متزوجة، تاريخ ائتماني جيد"

data = extract_with_llm(text)

print(data)