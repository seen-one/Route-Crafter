import subprocess
import json
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from threading import Semaphore
from collections import defaultdict
import os

app = Flask(__name__, static_folder=None)
CORS(app)

# Track active requests and IP addresses
active_requests = defaultdict(int)
simultaneous_lock = Semaphore(4)

# Timeout duration in seconds
TIMEOUT_DURATION = 120

@app.route('/')
def index():
    # Serve index.html from the root directory
    return send_from_directory(os.getcwd(), 'index.html')

@app.route('/generate-gpx/', methods=['POST'])
def generate_gpx_route():
    try:
        client_ip = request.remote_addr
        
        # Limit 1 request per IP at a time
        if active_requests[client_ip] > 0:
            return jsonify({'error': 'You are already generating a route. Please wait for it to finish.'}), 429
        
        # Acquire the semaphore for simultaneous requests limit (max 4)
        if not simultaneous_lock.acquire(blocking=False):
            return jsonify({'error': 'Too many requests are being processed. Please try again later.'}), 429
        
        active_requests[client_ip] += 1
        data = request.get_json()
        polygon_coords = data.get('polygon_coords')

        if not polygon_coords or not isinstance(polygon_coords, list):
            return jsonify({'error': 'Invalid polygon coordinates provided'}), 400

        # Run subprocess to generate GPX with timeout using stdin and stdout
        process = subprocess.Popen(
            ['python', 'generate_gpx.py'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        try:
            # Send polygon coordinates to the subprocess via stdin
            stdout, stderr = process.communicate(input=json.dumps(polygon_coords), timeout=TIMEOUT_DURATION)

            if process.returncode != 0:
                return jsonify({'error': stderr}), 500

            # Capture the GPX data from stdout
            gpx_data = stdout.strip()
            return jsonify({'gpx': gpx_data}), 200
        except subprocess.TimeoutExpired:
            process.kill()
            return jsonify({'error': 'Took too long to generate. Please try again with a smaller area.'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        active_requests[client_ip] -= 1
        simultaneous_lock.release()

if __name__ == '__main__':
    app.run(host='0.0.0.0' , port=5000, debug=False)
