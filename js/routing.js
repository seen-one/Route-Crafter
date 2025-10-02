// Routing and animation module

import { calculateDistance, calculateRouteDistanceToIndex, interpolatePoint, stopSpinner } from './utils.js';

export class RoutingManager {
    constructor(mapManager) {
        this.map = mapManager.getMap();
        this.drawnItems = mapManager.getDrawnItems();
        
        // Route data
        this.gpxData = null;
        this.routePoints = [];
        this.routeIndex = 0;
        this.currentRoutePolyline = null;
        this.currentPositionMarker = null;
        
        // Animation state
        this.animationInProgress = false;
        this.animationPaused = false;
        this.animationSpeed = 1;
        this.animationInterval = null;
        this.totalAnimationTime = 0;
        this.currentAnimationTime = 0;
        this.totalRouteDistance = 0;
        this.currentRouteDistance = 0;
        
        // Interpolation variables for smoother movement
        this.currentInterpolatedPosition = null;
        this.interpolationStep = 0;
        this.interpolationSteps = 10;
        this.useInterpolation = false;
        
        // UI elements
        this.mediaControls = document.getElementById('mediaControls');
        this.progressBar = document.getElementById('progressBar');
        this.isDragging = false;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // All button event listeners are handled by the main app
        // This module only handles internal routing functionality

        // Buffer size changes are handled by the main app

        // Media controls
        this.setupMediaControls();
    }

    setupMediaControls() {
        // Play/Pause
        document.getElementById('playPauseBtn').addEventListener('click', () => {
            if (this.animationInProgress && !this.animationPaused) {
                this.pauseAnimation();
            } else if (this.animationPaused) {
                this.resumeAnimation();
            } else {
                this.startRouteAnimation();
            }
        });

        // Play from beginning
        document.getElementById('playFromBeginningBtn').addEventListener('click', () => {
            this.playFromBeginning();
        });

        // Close
        document.getElementById('closeBtn').addEventListener('click', () => {
            this.stopAnimation();
        });

        // Speed controls
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all speed buttons
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                btn.classList.add('active');
                // Update animation speed
                this.animationSpeed = parseFloat(btn.getAttribute('data-speed'));
                
                // Update interpolation settings if animation is in progress
                if (this.animationInProgress) {
                    this.useInterpolation = this.needsSmoothInterpolation(this.animationSpeed);
                    // Adjust interpolation steps based on speed for optimal smoothness
                    if (this.animationSpeed <= 0.25) {
                        this.interpolationSteps = 20; // More steps for very slow speeds
                    } else if (this.animationSpeed <= 0.5) {
                        this.interpolationSteps = 15; // Medium steps for slow speeds
                    } else {
                        this.interpolationSteps = 10; // Default steps for other speeds
                    }
                }
            });
        });

        // Progress bar drag functionality
        this.setupProgressBarDrag();
    }

    setupProgressBarDrag() {
        this.progressBar.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.progressBar.classList.add('dragging');
            this.seekToPosition(e.clientX);
            e.preventDefault();
        });

        this.progressBar.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.seekToPosition(e.clientX);
            }
        });

        // Use document-level events to handle dragging outside the progress bar
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.seekToPosition(e.clientX);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.progressBar.classList.remove('dragging');
            }
        });

        // Touch events for mobile
        this.progressBar.addEventListener('touchstart', (e) => {
            this.isDragging = true;
            this.progressBar.classList.add('dragging');
            this.seekToPosition(e.touches[0].clientX);
            e.preventDefault();
        });

        // Use document-level touch events to handle dragging outside the progress bar
        document.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                this.seekToPosition(e.touches[0].clientX);
                e.preventDefault();
            }
        });

        document.addEventListener('touchend', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.progressBar.classList.remove('dragging');
            }
        });
    }





    startRouteAnimation() {
        if (this.routePoints.length === 0) {
            alert('No route to animate. Please generate the route first.');
            return;
        }
        
        // If animation is paused, resume it
        if (this.animationPaused) {
            this.resumeAnimation();
            return;
        }
        
        // If animation is already in progress or finished, stop and reset it
        if (this.animationInProgress || this.routeIndex >= this.routePoints.length) {
            this.stopAnimation();
            return;
        }
        
        // Start the animation
        this.startAnimation();
    }

    startAnimation() {
        this.animationInProgress = true;
        this.animationPaused = false;
        this.currentAnimationTime = 0;
        
        // Initialize interpolation
        this.useInterpolation = this.needsSmoothInterpolation(this.animationSpeed);
        this.interpolationStep = 0;
        this.currentInterpolatedPosition = null;
        
        // Adjust interpolation steps based on speed for optimal smoothness
        if (this.animationSpeed <= 0.25) {
            this.interpolationSteps = 20; // More steps for very slow speeds
        } else if (this.animationSpeed <= 0.5) {
            this.interpolationSteps = 15; // Medium steps for slow speeds
        } else {
            this.interpolationSteps = 10; // Default steps for other speeds
        }
        
        // Calculate total animation time (30ms per point)
        this.totalAnimationTime = this.routePoints.length * 30;
        
        // Calculate total route distance
        this.totalRouteDistance = calculateRouteDistanceToIndex(this.routePoints, this.routePoints.length - 1);
        
        // Show media controls
        this.toggleMediaControls(true);
        
        // Update play/pause button
        const playPauseBtn = document.getElementById('playPauseBtn');
        playPauseBtn.textContent = '⏸️';
        playPauseBtn.classList.add('active');
        
        // Start the animation loop
        this.updateAnimationFrame();
    }

    pauseAnimation() {
        this.animationPaused = true;
        if (this.animationInterval) {
            clearTimeout(this.animationInterval);
            this.animationInterval = null;
        }
        
        // Update play/pause button
        const playPauseBtn = document.getElementById('playPauseBtn');
        playPauseBtn.textContent = '▶️';
        playPauseBtn.classList.remove('active');
    }

    resumeAnimation() {
        this.animationPaused = false;
        
        // Update play/pause button
        const playPauseBtn = document.getElementById('playPauseBtn');
        playPauseBtn.textContent = '⏸️';
        playPauseBtn.classList.add('active');
        
        // Continue the animation
        this.updateAnimationFrame();
    }

    stopAnimation() {
        this.animationInProgress = false;
        this.animationPaused = false;
        this.routeIndex = 0;
        this.currentAnimationTime = 0;
        this.currentRouteDistance = 0;
        
        if (this.animationInterval) {
            clearTimeout(this.animationInterval);
            this.animationInterval = null;
        }
        
        // Remove polylines and marker
        if (this.currentRoutePolyline) {
            this.map.removeLayer(this.currentRoutePolyline);
            this.currentRoutePolyline = null;
        }
        if (this.currentPositionMarker) {
            this.map.removeLayer(this.currentPositionMarker);
            this.currentPositionMarker = null;
        }
        
        // Hide media controls
        this.toggleMediaControls(false);
        
        // Reset buttons
        const playPauseBtn = document.getElementById('playPauseBtn');
        playPauseBtn.textContent = '▶️';
        playPauseBtn.classList.remove('active');
        
        // Reset progress
        this.updateProgress();
    }

    playFromBeginning() {
        if (this.routePoints.length === 0) {
            alert('No route to animate. Please generate the route first.');
            return;
        }
        
        // Stop current animation
        if (this.animationInProgress) {
            if (this.animationInterval) {
                clearTimeout(this.animationInterval);
                this.animationInterval = null;
            }
        }
        
        // Reset to beginning
        this.routeIndex = 0;
        this.currentAnimationTime = 0;
        this.animationPaused = false;
        
        // Start animation
        this.startAnimation();
    }

    updateAnimationFrame() {
        if (!this.animationInProgress || this.animationPaused || this.routeIndex >= this.routePoints.length) {
            if (this.routeIndex >= this.routePoints.length) {
                // Animation completed
                this.animationInProgress = false;
                const playPauseBtn = document.getElementById('playPauseBtn');
                playPauseBtn.textContent = '▶️';
                playPauseBtn.classList.remove('active');
            }
            return;
        }
        
        let currentPoint;
        
        if (this.useInterpolation && this.routeIndex < this.routePoints.length - 1) {
            // Use interpolation for smoother movement
            const point1 = this.routePoints[this.routeIndex];
            const point2 = this.routePoints[this.routeIndex + 1];
            const t = this.interpolationStep / this.interpolationSteps;
            
            currentPoint = interpolatePoint(point1, point2, t);
            this.currentInterpolatedPosition = currentPoint;
            
            // Increment interpolation step
            this.interpolationStep++;
            
            // If we've completed interpolation between these two points, move to next point
            if (this.interpolationStep >= this.interpolationSteps) {
                this.interpolationStep = 0;
                this.routeIndex++;
            }
        } else {
            // Use discrete point movement (original behavior)
            currentPoint = this.routePoints[this.routeIndex];
            this.routeIndex++;
        }
        
        // Create interpolated route lines
        let routeUntilCurrent;
        
        if (this.useInterpolation && this.currentInterpolatedPosition) {
            // Create interpolated route up to current position
            routeUntilCurrent = this.routePoints.slice(0, this.routeIndex + 1);
            if (this.currentInterpolatedPosition) {
                routeUntilCurrent.push(this.currentInterpolatedPosition);
            }
        } else {
            // Use discrete points (original behavior)
            routeUntilCurrent = this.routePoints.slice(0, this.routeIndex + 1);
        }
        
        // Remove the old red polyline if it exists
        if (this.currentRoutePolyline) {
            this.map.removeLayer(this.currentRoutePolyline);
        }
        
        // Create a new red polyline for the current route
        this.currentRoutePolyline = L.polyline(routeUntilCurrent, {
            color: 'red',
            weight: 4,
            opacity: 0.7
        }).addTo(this.map);
        
        // Add/update current position marker
        if (this.currentPositionMarker) {
            this.map.removeLayer(this.currentPositionMarker);
        }
        
        this.currentPositionMarker = L.circleMarker(currentPoint, {
            radius: 8,
            fillColor: '#ff6b35',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.map);
        
        // Update animation time
        if (!this.useInterpolation) {
            this.currentAnimationTime += 30;
        } else {
            // For interpolation, update time more frequently for smoother progress
            this.currentAnimationTime += 30 / this.interpolationSteps;
        }
        
        // Update progress
        this.updateProgress();
        
        // Calculate next interval based on speed
        let interval;
        if (this.useInterpolation) {
            // For interpolation, use smaller intervals for smoother movement
            interval = Math.max(30 / (this.animationSpeed * this.interpolationSteps), 2); // Minimum 2ms interval
        } else {
            interval = Math.max(30 / this.animationSpeed, 5); // Minimum 5ms interval
        }
        
        // Schedule next animation step
        this.animationInterval = setTimeout(() => this.updateAnimationFrame(), interval);
    }

    needsSmoothInterpolation(speed) {
        return speed < 1; // Use interpolation for speeds slower than 1x
    }

    updateProgress() {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (this.routePoints.length === 0) return;
        
        const progress = (this.routeIndex / this.routePoints.length) * 100;
        progressFill.style.width = progress + '%';
        
        // Calculate current distance
        this.currentRouteDistance = calculateRouteDistanceToIndex(this.routePoints, this.routeIndex);
        
        // Update distance display
        progressText.textContent = `${this.currentRouteDistance.toFixed(1)} km / ${this.totalRouteDistance.toFixed(1)} km`;
    }

    seekToPosition(clientX) {
        if (this.routePoints.length === 0) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const clickX = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        const newIndex = Math.floor(percentage * this.routePoints.length);
        
        if (newIndex >= 0 && newIndex < this.routePoints.length) {
            this.routeIndex = newIndex;
            this.currentAnimationTime = newIndex * 30;
            this.currentRouteDistance = calculateRouteDistanceToIndex(this.routePoints, this.routeIndex);
            this.updateProgress();
            
            // Update the route display
            if (this.routeIndex > 0) {
                const routeUntilCurrent = this.routePoints.slice(0, this.routeIndex + 1);
                
                // Remove existing polylines
                if (this.currentRoutePolyline) {
                    this.map.removeLayer(this.currentRoutePolyline);
                }
                
                // Create new polylines
                this.currentRoutePolyline = L.polyline(routeUntilCurrent, {
                    color: 'red',
                    weight: 4,
                    opacity: 0.7
                }).addTo(this.map);
                
                // Add/update current position marker
                if (this.currentPositionMarker) {
                    this.map.removeLayer(this.currentPositionMarker);
                }
                
                const currentPoint = this.routePoints[this.routeIndex];
                this.currentPositionMarker = L.circleMarker(currentPoint, {
                    radius: 8,
                    fillColor: '#ff6b35',
                    color: '#ffffff',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(this.map);
            }
        }
    }

    toggleMediaControls(show) {
        const bottomControls = document.querySelector('.leaflet-bottom');
        
        if (show) {
            this.mediaControls.classList.add('visible');
            // Hide leaflet-bottom on mobile when media controls are visible
            if (window.innerWidth <= 600 || (window.innerHeight <= 450 && window.innerWidth > window.innerHeight)) {
                if (bottomControls) {
                    bottomControls.style.display = 'none';
                }
            }
        } else {
            this.mediaControls.classList.remove('visible');
            // Show leaflet-bottom again when media controls are hidden
            if (bottomControls) {
                bottomControls.style.display = '';
            }
        }
    }


    // Setter for route points (called by main app)
    setRoutePoints(points) {
        this.routePoints = points;
    }

    // Getter for route points
    getRoutePoints() {
        return this.routePoints;
    }
}
