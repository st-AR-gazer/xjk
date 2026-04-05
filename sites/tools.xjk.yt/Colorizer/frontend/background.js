document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('dotCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let dots = [];
    const dotCount = 500;   // Adjust density as needed
    const maxDistance = 50; // Max distance to interact with the cursor

    class Dot {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.baseX = this.x;
            this.baseY = this.y;
            this.size = 2;
        }
    
        draw() {
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            colorArrayGlobal.forEach((color, index) => {
                let stop = index / (colorArrayGlobal.length - 1);
                gradient.addColorStop(stop, color);
            });

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        }

        update(mouseX, mouseY) {
            let dx = mouseX - this.x;
            let dy = mouseY - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            let forceDirectionX = dx / distance;
            let forceDirectionY = dy / distance;
            let force = (maxDistance - distance) / maxDistance;
            let directionX = forceDirectionX * force * this.size;
            let directionY = forceDirectionY * force * this.size;

            if (distance < maxDistance) {
                this.x -= directionX;
                this.y -= directionY;
            } else {
                if (this.x !== this.baseX) {
                    this.x -= (this.x - this.baseX) / 10;
                }
                if (this.y !== this.baseY) {
                    this.y -= (this.y - this.baseY) / 10;
                }
            }
        }
    }

    function initDots() {
        dots = [];
        let overlap = 50; // Adjust spacing between dots
        let rowCount = canvas.width / overlap;
        let columnCount = canvas.height / overlap;

        for (let x = 0; x < rowCount; x++) {
            for (let y = 0; y < columnCount; y++) {
                dots.push(new Dot(x * overlap, y * overlap));
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < dots.length; i++) {
            dots[i].draw();
            dots[i].update(mouse.x, mouse.y);
        }
        requestAnimationFrame(animate);
    }

    let mouse = {
        x: null,
        y: null
    };

    window.addEventListener('mousemove', function(e) {
        mouse.x = e.x;
        mouse.y = e.y;
    });

    window.addEventListener('resize', function() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initDots();
    });

    initDots();
    animate();
});
