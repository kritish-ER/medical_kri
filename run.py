import os
import sys
import webbrowser
import time
from app import app

if __name__ == '__main__':
    port = 5000
    url = f"http://localhost:{port}"
    print("=" * 60)
    print("🏥 MEDIMIND AI - MEDICAL ASSISTANT & CHATBOT APPLICATION")
    print("=" * 60)
    print(f"🚀 Server is running on: {url}")
    print("💡 Open the link in your web browser to start using the app.")
    print("Press CTRL+C to stop the server.")
    print("=" * 60)
    
    # Automatically open browser after 1.5 seconds
    try:
        webbrowser.open(url)
    except Exception:
        pass

    app.run(host='0.0.0.0', port=port, debug=False)
