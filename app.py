import subprocess
import json
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from threading import Semaphore
from collections import defaultdict
import os
import platform

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
        truncate_by_edge = data.get('truncate_by_edge', True)  # Default to True for backward compatibility
        consolidate_tolerance = data.get('consolidate_tolerance', 15)  # Default to 15 for backward compatibility
        custom_filter = data.get('custom_filter', None)  # Default to None for backward compatibility

        if not polygon_coords or not isinstance(polygon_coords, list):
            return jsonify({'error': 'Invalid polygon coordinates provided'}), 400
            
        def get_venv_python():
            if platform.system() == 'Windows':
                venv_python = os.path.join('env', 'Scripts', 'python.exe')
            else:
                venv_python = os.path.join('env', 'bin', 'python')
            if os.path.exists(venv_python):
                return venv_python
            return 'python'  # fallback to system python if venv not found

        python_executable = get_venv_python()
        generate_gpx_path = os.path.join(os.getcwd(), 'generate_gpx.py')

        # Run subprocess to generate GPX with timeout using stdin and stdout
        process = subprocess.Popen(
            [python_executable, generate_gpx_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        try:
            # Prepare input data with all parameters
            input_data = {
                'polygon_coords': polygon_coords,
                'truncate_by_edge': truncate_by_edge,
                'consolidate_tolerance': consolidate_tolerance,
                'custom_filter': custom_filter
            }
            # Send data to the subprocess via stdin
            stdout, stderr = process.communicate(input=json.dumps(input_data), timeout=TIMEOUT_DURATION)

            if process.returncode != 0:
                return jsonify({'error': stderr}), 500

            # Capture the GPX data from stdout
            gpx_data = stdout.strip()
            
            # Check if the response is an error (JSON format)
            try:
                error_data = json.loads(gpx_data)
                if 'error' in error_data:
                    return jsonify({'error': error_data['error']}), 500
            except json.JSONDecodeError:
                # Not JSON, so it's valid GPX data
                pass
            
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
