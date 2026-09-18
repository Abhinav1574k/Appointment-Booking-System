# Appointment Booking System
A full-stack appointment scheduling system built using Node.js, Express.js, SQLite, HTML5, CSS3 and JavaScript.

## Features

- Provider availability configuration
- Weekly working hours
- Automatic appointment slot generation
- Client appointment booking
- Double-booking prevention
- Booking confirmation
- Appointment history
- Appointment cancellation
- Appointment rescheduling
- REST API
- SQLite relational database
- Responsive interface
- Provider timezone support

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Node.js
- Express.js
- SQLite
- REST API

## Installation

Clone the repository:

```bash
git clone YOUR_REPOSITORY_URL
cd appointment-booking-system
```

Install dependencies:
```bash
npm install
```

Start the server:
```bash
npm start
```

Open:
http://localhost:3000


## Database

The application creates a SQLite database automatically.

Tables:
- providers
- availability
- appointments


## Appointment Logic
- Provider working hours are divided into 30-minute slots.

- Available slots are calculated by subtracting existing active appointments from provider availability.


## Conflict Prevention
A SQLite unique partial index prevents two active appointments from using the same provider, date and time slot.


## API Endpoints
1. Providers
GET /api/providers

GET /api/providers/:id/availability

PUT /api/providers/:id/availability

2. Slots

GET /api/slots?provider_id=1&date=YYYY-MM-DD

3. Appointments

GET /api/appointments

POST /api/appointments

PATCH /api/appointments/:id/cancel

PATCH /api/appointments/:id/reschedule

4. Health

GET /api/health


## Project Structure
appointment-booking-system/
├── server.js
├── package.json
├── README.md
├── .gitignore
├── data/
│   └── .gitkeep
└── public/
    ├── index.html
    ├── style.css
    └── script.js

## Learning Outcomes
This project demonstrates:

1. Relational database modeling
2. REST API development
3. Time-slot generation
4. Availability computation
5. Database constraints
6. Conflict prevention
7. CRUD operations
8. Asynchronous JavaScript
9. Responsive UI development


