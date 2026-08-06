import os
import sys
import re
import math
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__, static_folder='static', template_folder='static')
CORS(app)

# =========================================================
# DATASET LOADING & KNOWLEDGE BASE ENGINE
# =========================================================
DATASET_PATH = 'Medical_Chatbot_GenAI.csv'
SYMPTOMS_DATASET_PATH = 'symptoms_data.csv'

DISEASE_DB = {}
ALL_SYMPTOMS = []
SYMPTOM_TO_DISEASES = {}
ANALYTICS_DATA = {}

def init_knowledge_base():
    global DISEASE_DB, ALL_SYMPTOMS, SYMPTOM_TO_DISEASES, ANALYTICS_DATA
    
    if not os.path.exists(DATASET_PATH):
        print(f"[Warning] Dataset {DATASET_PATH} not found.")
        return

    try:
        df = pd.read_csv(DATASET_PATH, encoding='latin1')
        df.columns = df.columns.str.strip()
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]

        disease_groups = df.groupby('medical_condition')
        
        all_symptoms_set = set()
        disease_db = {}
        symptom_to_diseases = {}

        for disease_name, group in disease_groups:
            clean_name = str(disease_name).strip()
            
            # Extract symptoms
            raw_symptoms = group['symptoms'].dropna().astype(str).tolist()
            symptoms_list = []
            for s in raw_symptoms:
                for parts in s.split(','):
                    cleaned_s = parts.strip().lower()
                    if cleaned_s and len(cleaned_s) > 1:
                        symptoms_list.append(cleaned_s)
                        all_symptoms_set.add(cleaned_s)
                        if cleaned_s not in symptom_to_diseases:
                            symptom_to_diseases[cleaned_s] = set()
                        symptom_to_diseases[cleaned_s].add(clean_name)
            
            symptoms_list = sorted(list(set(symptoms_list)))

            # Extract drugs & ratings
            drugs_info = []
            for _, row in group.iterrows():
                d_name = str(row.get('drug_name', '')).strip()
                if d_name and d_name != 'nan':
                    rating = row.get('rating', None)
                    rx_otc = str(row.get('rx_otc', 'N/A')).strip()
                    drugs_info.append({
                        'name': d_name,
                        'rating': float(rating) if pd.notnull(rating) else 7.0,
                        'rx_otc': rx_otc
                    })

            # Deduplicate drugs
            unique_drugs = {}
            for d in drugs_info:
                if d['name'] not in unique_drugs:
                    unique_drugs[d['name']] = d
            drugs_list = list(unique_drugs.values())

            # Side effects
            raw_side = group['side_effects'].dropna().astype(str).tolist()
            side_effects = []
            for se in raw_side:
                for parts in se.split(','):
                    c_se = parts.strip()
                    if c_se and c_se != 'nan':
                        side_effects.append(c_se.title())
            side_effects = sorted(list(set(side_effects)))

            # Body parts
            raw_body = group['body_part'].dropna().astype(str).tolist()
            body_parts = []
            for bp in raw_body:
                for parts in bp.split(','):
                    c_bp = parts.strip()
                    if c_bp and c_bp != 'nan':
                        body_parts.append(c_bp)
            body_parts = sorted(list(set(body_parts)))

            # Age groups
            age_groups = group['age_group'].dropna().astype(str).unique().tolist()
            age_groups = [a for a in age_groups if a != 'nan']

            # Alcohol warning
            alcohol = group['alcohol'].dropna().astype(str).unique().tolist()
            alcohol_warning = "Avoid alcohol or consult doctor" if 'X' in alcohol or 'Yes' in alcohol else "No severe direct interaction noted"

            # Average Rating & Reviews
            avg_rating = group['rating'].dropna().mean()
            tot_reviews = group['no_of_reviews'].dropna().sum()

            disease_db[clean_name.lower()] = {
                'id': clean_name.lower().replace(' ', '_').replace('/', '_'),
                'name': clean_name,
                'symptoms': symptoms_list,
                'drugs': drugs_list,
                'side_effects': side_effects,
                'body_parts': body_parts,
                'age_groups': age_groups,
                'alcohol_warning': alcohol_warning,
                'avg_rating': round(float(avg_rating), 1) if pd.notnull(avg_rating) else 7.5,
                'total_reviews': int(tot_reviews) if pd.notnull(tot_reviews) else 0,
                'record_count': len(group)
            }

        DISEASE_DB = disease_db
        ALL_SYMPTOMS = sorted(list(all_symptoms_set))
        SYMPTOM_TO_DISEASES = {k: list(v) for k, v in symptom_to_diseases.items()}

        # Analytics prep
        top_diseases = sorted(
            [{'name': d['name'], 'count': d['record_count'], 'rating': d['avg_rating']} for d in DISEASE_DB.values()],
            key=lambda x: x['count'], reverse=True
        )[:15]

        # Top symptoms by occurrence across diseases
        symptom_counts = []
        for sym, d_list in SYMPTOM_TO_DISEASES.items():
            symptom_counts.append({'symptom': sym.title(), 'count': len(d_list)})
        top_symptoms = sorted(symptom_counts, key=lambda x: x['count'], reverse=True)[:15]

        ANALYTICS_DATA = {
            'total_diseases': len(DISEASE_DB),
            'total_symptoms': len(ALL_SYMPTOMS),
            'total_records': len(df),
            'top_diseases': top_diseases,
            'top_symptoms': top_symptoms
        }

        print(f"[Success] Knowledge Base Loaded: {len(DISEASE_DB)} diseases, {len(ALL_SYMPTOMS)} unique symptoms.")

    except Exception as e:
        print(f"[Error] Error initializing Knowledge Base: {e}")

init_knowledge_base()

# =========================================================
# PREDICTION & MATCHING ENGINE
# =========================================================
def extract_symptoms_from_text(text):
    """
    Parses user natural language text to extract symptoms.
    """
    text_lower = text.lower()
    detected = set()

    for symptom in ALL_SYMPTOMS:
        pattern = r'\b' + re.escape(symptom) + r'\b'
        if re.search(pattern, text_lower) or symptom in text_lower:
            detected.add(symptom)

    synonyms = {
        'fever': ['fever', 'high temp', 'temperature', 'chills'],
        'headache': ['headache', 'head pain', 'migraine'],
        'itching': ['itching', 'itchy', 'irritation', 'itch'],
        'skin rash': ['skin rash', 'rash', 'pimples', 'whiteheads', 'blackheads', 'lesions'],
        'cough': ['cough', 'coughing', 'dry cough'],
        'fatigue': ['fatigue', 'tired', 'tiredness', 'exhaustion'],
        'nausea': ['nausea', 'vomiting', 'queasy'],
        'chest pain': ['chest pain', 'tight chest'],
        'shortness of breath': ['breathless', 'shortness of breath', 'wheezing', 'difficulty breathing'],
        'pain': ['pain', 'ache', 'soreness'],
        'redness': ['redness', 'red skin', 'inflammation']
    }

    for clean_sym, syn_list in synonyms.items():
        if any(syn in text_lower for syn in syn_list):
            if clean_sym in ALL_SYMPTOMS:
                detected.add(clean_sym)

    return sorted(list(detected))


def predict_disease_from_symptoms(user_symptoms):
    """
    Calculates statistical match score for all diseases based on input symptoms.
    """
    if not user_symptoms:
        return []

    user_sym_set = set([s.lower() for s in user_symptoms])
    results = []

    for dis_id, data in DISEASE_DB.items():
        dis_sym_set = set(data['symptoms'])
        
        matched = user_sym_set.intersection(dis_sym_set)
        match_count = len(matched)

        if match_count > 0:
            recall = match_count / len(user_sym_set)
            precision = match_count / len(dis_sym_set) if len(dis_sym_set) > 0 else 0
            score = (recall * 0.7) + (precision * 0.3)
            confidence = round(min(98.0, (recall * 85) + (match_count * 5)), 1)

            results.append({
                'id': data['id'],
                'disease': data['name'],
                'match_count': match_count,
                'matched_symptoms': [m.title() for m in matched],
                'all_disease_symptoms': [s.title() for s in data['symptoms']],
                'confidence': confidence,
                'score': score,
                'drugs': data['drugs'][:3],
                'side_effects': data['side_effects'][:4],
                'body_parts': data['body_parts'][:3],
                'avg_rating': data['avg_rating'],
                'alcohol_warning': data['alcohol_warning']
            })

    results = sorted(results, key=lambda x: (x['match_count'], x['confidence']), reverse=True)
    return results[:5]

# =========================================================
# CHATBOT CONVERSATIONAL NLP ENGINE
# =========================================================
def process_chat_message(user_msg):
    """
    Core NLP router and responder for the medical chatbot.
    """
    msg_clean = user_msg.strip().lower()

    if not msg_clean:
        return {
            'response': "Hello! Please type your symptoms or ask a question about any disease.",
            'type': 'greeting'
        }

    # 1. Check for Greetings / Intros
    greetings = ['hi', 'hello', 'hey', 'greetings', 'start', 'help', 'who are you']
    if any(msg_clean == g or msg_clean.startswith(g + ' ') for g in greetings) and len(msg_clean.split()) < 4:
        return {
            'response': """👋 **Hello! I am your AI Medical Assistant.**

I can help you with:
• **Disease Diagnosis**: Tell me your symptoms (e.g., *"I have fever, cough, and shortness of breath"*).
• **Disease Info**: Ask about any condition (e.g., *"Tell me about Asthma"* or *"What is Acne?"*).
• **Medications & Side Effects**: Ask about treatments (e.g., *"What drugs treat ADHD?"* or *"Side effects of Diabetes medicine"*).

How can I assist you today? Please describe your symptoms or ask your medical question!""",
            'type': 'greeting'
        }

    # 2. Check if user is asking about a specific disease
    for dis_key, dis_data in DISEASE_DB.items():
        if dis_key in msg_clean or dis_data['name'].lower() in msg_clean:
            drugs_str = ", ".join([d['name'] for d in dis_data['drugs'][:5]]) or "Consult physician"
            symptoms_str = ", ".join([s.title() for s in dis_data['symptoms'][:8]]) or "Various"
            effects_str = ", ".join(dis_data['side_effects'][:6]) or "None listed"
            body_str = ", ".join(dis_data['body_parts'][:4]) or "General body"
            age_str = ", ".join(dis_data['age_groups']) or "All age groups"

            response_md = f"""🏥 **Medical Profile: {dis_data['name']}**

• **Common Symptoms**: {symptoms_str}
• **Primary Medications**: {drugs_str}
• **Potential Side Effects**: {effects_str}
• **Affected Body Parts**: {body_str}
• **Target Age Groups**: {age_str}
• **Alcohol Advisory**: {dis_data['alcohol_warning']}
• **Average Treatment Rating**: ⭐ {dis_data['avg_rating']}/10 ({dis_data['total_reviews']} patient reviews)

⚠️ *Disclaimer: This information is for educational purposes. Always consult a healthcare professional for diagnosis and prescriptions.*"""
            
            return {
                'response': response_md,
                'disease_info': dis_data,
                'type': 'disease_info'
            }

    # 3. Check for Symptom Diagnosis input
    detected_symptoms = extract_symptoms_from_text(msg_clean)
    
    if len(detected_symptoms) >= 1:
        predictions = predict_disease_from_symptoms(detected_symptoms)
        
        if predictions:
            top = predictions[0]
            detected_formatted = ", ".join([s.title() for s in detected_symptoms])
            
            resp_md = f"""🔍 **Diagnosis Analysis & Statistical Evidence**

I identified **{len(detected_symptoms)} symptoms**: `{detected_formatted}`

🥇 **Primary Matched Disease: {top['disease']}** (Confidence: **{top['confidence']}%**)
• **Matched Evidence**: {", ".join(top['matched_symptoms'])}
• **Recommended Medications**: {", ".join([d['name'] for d in top['drugs']])}
• **Key Side Effects to Watch**: {", ".join(top['side_effects'])}
• **Body Parts Affected**: {", ".join(top['body_parts'])}
• **Alcohol Caution**: {top['alcohol_warning']}"""

            if len(predictions) > 1:
                other_matches = ", ".join([f"**{p['disease']}** ({p['confidence']}%)" for p in predictions[1:3]])
                resp_md += f"\n\n🥈 **Alternative Possibilities**: {other_matches}"

            resp_md += "\n\n📋 *Next Steps: Would you like details on medications, side effects, or advice on seeing a specialist for this condition?*"
            resp_md += "\n\n⚠️ *Medical Disclaimer: AI predictions are statistical matches based on patient data and do not substitute for a professional medical exam.*"

            return {
                'response': resp_md,
                'detected_symptoms': [s.title() for s in detected_symptoms],
                'predictions': predictions,
                'type': 'prediction'
            }

    # 4. Fallback for general Q&A
    return {
        'response': f"""I listened carefully to your query: *"{user_msg}"*

I couldn't identify specific symptoms or a condition from my database of 48+ diseases. 

💡 **Tips for best results:**
• List 2 or more symptoms (e.g., *"I have fever, itching, and skin rash"*).
• Or ask about a specific condition (e.g., *"What is ADHD?"* or *"Tell me about Allergies"*).
• Or ask about drugs (e.g., *"What drugs treat Bronchitis?"*).""",
        'type': 'fallback'
    }

# =========================================================
# REST API ROUTES
# =========================================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        'status': 'online',
        'diseases_count': len(DISEASE_DB),
        'symptoms_count': len(ALL_SYMPTOMS)
    })

@app.route('/api/chat', methods=['POST'])
def api_chat():
    data = request.json or {}
    message = data.get('message', '')
    res = process_chat_message(message)
    return jsonify(res)

@app.route('/api/predict', methods=['POST'])
def api_predict():
    data = request.json or {}
    symptoms = data.get('symptoms', [])
    if isinstance(symptoms, str):
        symptoms = [s.strip() for s in symptoms.split(',')]
    
    predictions = predict_disease_from_symptoms(symptoms)
    return jsonify({
        'input_symptoms': symptoms,
        'predictions': predictions
    })

@app.route('/api/diseases', methods=['GET'])
def api_diseases():
    query = request.args.get('search', '').lower().strip()
    disease_list = list(DISEASE_DB.values())
    
    if query:
        disease_list = [
            d for d in disease_list 
            if query in d['name'].lower() or any(query in s for s in d['symptoms'])
        ]
    
    return jsonify(disease_list)

@app.route('/api/symptoms', methods=['GET'])
def api_symptoms():
    formatted = [{'id': s, 'name': s.title()} for s in ALL_SYMPTOMS]
    return jsonify(formatted)

@app.route('/api/analytics', methods=['GET'])
def api_analytics():
    return jsonify(ANALYTICS_DATA)

if __name__ == '__main__':
    print("[Server] Starting Medical AI Server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
