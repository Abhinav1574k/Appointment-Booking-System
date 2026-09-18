const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, "data", "appointments.db");

const db = new sqlite3.Database(dbPath);

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          id: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function initializeDatabase() {
  await run(`PRAGMA foreign_keys = ON`);

  await run(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (provider_id)
        REFERENCES providers(id)
        ON DELETE CASCADE,
      UNIQUE(provider_id, weekday)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'booked'
        CHECK(status IN ('booked', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id)
        REFERENCES providers(id)
        ON DELETE CASCADE
    )
  `);

  // Prevent two active appointments from using the same slot.
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking
    ON appointments(provider_id, appointment_date, start_time)
    WHERE status = 'booked'
  `);

  const provider = await get(`SELECT * FROM providers LIMIT 1`);

  if (!provider) {
    const result = await run(
      `
      INSERT INTO providers
      (name, specialty, timezone)
      VALUES (?, ?, ?)
      `,
      [
        "Dr. Ananya Sharma",
        "General Consultation",
        "Asia/Kolkata"
      ]
    );

    const providerId = result.id;

    // Monday-Friday: 9:00 AM - 5:00 PM
    for (let weekday = 1; weekday <= 5; weekday++) {
      await run(
        `
        INSERT INTO availability
        (provider_id, weekday, start_time, end_time)
        VALUES (?, ?, ?, ?)
        `,
        [providerId, weekday, "09:00", "17:00"]
      );
    }

    console.log("Demo provider created.");
  }

  console.log("Database initialized.");
}

function isValidDateString(dateString) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
}

function isValidTimeString(timeString) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeString);
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");

  const mins = (minutes % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${mins}`;
}

function getWeekday(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();
}

async function getProvider(providerId) {
  return get(
    `SELECT * FROM providers WHERE id = ?`,
    [providerId]
  );
}

/*
  GET PROVIDERS
*/
app.get("/api/providers", async (req, res) => {
  try {
    const providers = await all(`
      SELECT *
      FROM providers
      ORDER BY name
    `);

    res.json(providers);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to load providers."
    });
  }
});

/*
  GET PROVIDER AVAILABILITY
*/
app.get("/api/providers/:id/availability", async (req, res) => {
  try {
    const providerId = Number(req.params.id);

    const provider = await getProvider(providerId);

    if (!provider) {
      return res.status(404).json({
        error: "Provider not found."
      });
    }

    const availability = await all(
      `
      SELECT *
      FROM availability
      WHERE provider_id = ?
      ORDER BY weekday
      `,
      [providerId]
    );

    res.json({
      provider,
      availability
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load availability."
    });
  }
});

/*
  UPDATE PROVIDER AVAILABILITY
*/
app.put("/api/providers/:id/availability", async (req, res) => {
  try {
    const providerId = Number(req.params.id);
    const { weekday, start_time, end_time } = req.body;

    if (
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    ) {
      return res.status(400).json({
        error: "Invalid weekday."
      });
    }

    if (
      !isValidTimeString(start_time) ||
      !isValidTimeString(end_time)
    ) {
      return res.status(400).json({
        error: "Invalid time."
      });
    }

    if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({
        error: "End time must be after start time."
      });
    }

    const provider = await getProvider(providerId);

    if (!provider) {
      return res.status(404).json({
        error: "Provider not found."
      });
    }

    await run(
      `
      INSERT INTO availability
      (provider_id, weekday, start_time, end_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider_id, weekday)
      DO UPDATE SET
        start_time = excluded.start_time,
        end_time = excluded.end_time
      `,
      [
        providerId,
        weekday,
        start_time,
        end_time
      ]
    );

    const updated = await get(
      `
      SELECT *
      FROM availability
      WHERE provider_id = ?
      AND weekday = ?
      `,
      [providerId, weekday]
    );

    res.json(updated);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to update availability."
    });
  }
});

/*
  GET AVAILABLE SLOTS
*/
app.get("/api/slots", async (req, res) => {
  try {
    const providerId = Number(req.query.provider_id);
    const date = req.query.date;

    if (!providerId || !date || !isValidDateString(date)) {
      return res.status(400).json({
        error: "Provider and valid date are required."
      });
    }

    const provider = await getProvider(providerId);

    if (!provider) {
      return res.status(404).json({
        error: "Provider not found."
      });
    }

    const weekday = getWeekday(date);

    const availability = await get(
      `
      SELECT *
      FROM availability
      WHERE provider_id = ?
      AND weekday = ?
      `,
      [providerId, weekday]
    );

    if (!availability) {
      return res.json({
        date,
        slots: []
      });
    }

    const bookings = await all(
      `
      SELECT start_time, end_time
      FROM appointments
      WHERE provider_id = ?
      AND appointment_date = ?
      AND status = 'booked'
      `,
      [providerId, date]
    );

    const bookedSlots = new Set(
      bookings.map(booking => booking.start_time)
    );

    const slots = [];

    const start = timeToMinutes(
      availability.start_time
    );

    const end = timeToMinutes(
      availability.end_time
    );

    // Appointment duration = 30 minutes
    for (
      let current = start;
      current + 30 <= end;
      current += 30
    ) {
      const startTime = minutesToTime(current);
      const endTime = minutesToTime(current + 30);

      slots.push({
        start_time: startTime,
        end_time: endTime,
        available: !bookedSlots.has(startTime)
      });
    }

    res.json({
      date,
      weekday: DAYS[weekday],
      timezone: provider.timezone,
      slots
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to calculate available slots."
    });
  }
});

/*
  CREATE APPOINTMENT
*/
app.post("/api/appointments", async (req, res) => {
  try {
    const {
      provider_id,
      client_name,
      client_email,
      appointment_date,
      start_time
    } = req.body;

    const providerId = Number(provider_id);

    if (
      !providerId ||
      !client_name ||
      !client_email ||
      !appointment_date ||
      !start_time
    ) {
      return res.status(400).json({
        error: "All booking fields are required."
      });
    }

    if (!isValidDateString(appointment_date)) {
      return res.status(400).json({
        error: "Invalid appointment date."
      });
    }

    if (!isValidTimeString(start_time)) {
      return res.status(400).json({
        error: "Invalid appointment time."
      });
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(client_email)) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    const provider = await getProvider(providerId);

    if (!provider) {
      return res.status(404).json({
        error: "Provider not found."
      });
    }

    const weekday = getWeekday(appointment_date);

    const availability = await get(
      `
      SELECT *
      FROM availability
      WHERE provider_id = ?
      AND weekday = ?
      `,
      [providerId, weekday]
    );

    if (!availability) {
      return res.status(409).json({
        error: "Provider is not available on this day."
      });
    }

    const startMinutes = timeToMinutes(start_time);

    const endMinutes = startMinutes + 30;

    if (
      startMinutes < timeToMinutes(availability.start_time) ||
      endMinutes > timeToMinutes(availability.end_time)
    ) {
      return res.status(409).json({
        error: "Selected time is outside provider availability."
      });
    }

    const endTime = minutesToTime(endMinutes);

    /*
      Database-level conflict prevention.
      If another request books the same provider/date/time,
      SQLite UNIQUE constraint will reject one of them.
    */
    try {
      const result = await run(
        `
        INSERT INTO appointments
        (
          provider_id,
          client_name,
          client_email,
          appointment_date,
          start_time,
          end_time,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'booked')
        `,
        [
          providerId,
          client_name.trim(),
          client_email.trim(),
          appointment_date,
          start_time,
          endTime
        ]
      );

      const appointment = await get(
        `
        SELECT
          a.*,
          p.name AS provider_name,
          p.specialty,
          p.timezone
        FROM appointments a
        JOIN providers p
          ON a.provider_id = p.id
        WHERE a.id = ?
        `,
        [result.id]
      );

      res.status(201).json({
        message: "Appointment booked successfully.",
        appointment
      });
    } catch (error) {
      if (
        error.code === "SQLITE_CONSTRAINT" ||
        error.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return res.status(409).json({
          error:
            "This appointment slot was just booked by another client. Please select another slot."
        });
      }

      throw error;
    }
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create appointment."
    });
  }
});

/*
  GET APPOINTMENTS
*/
app.get("/api/appointments", async (req, res) => {
  try {
    const providerId = req.query.provider_id;

    let sql = `
      SELECT
        a.*,
        p.name AS provider_name,
        p.specialty,
        p.timezone
      FROM appointments a
      JOIN providers p
        ON a.provider_id = p.id
    `;

    const params = [];

    if (providerId) {
      sql += ` WHERE a.provider_id = ? `;
      params.push(Number(providerId));
    }

    sql += `
      ORDER BY
        a.appointment_date DESC,
        a.start_time ASC
    `;

    const appointments = await all(sql, params);

    res.json(appointments);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load appointments."
    });
  }
});

/*
  CANCEL APPOINTMENT
*/
app.patch("/api/appointments/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const appointment = await get(
      `
      SELECT *
      FROM appointments
      WHERE id = ?
      `,
      [id]
    );

    if (!appointment) {
      return res.status(404).json({
        error: "Appointment not found."
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        error: "Appointment is already cancelled."
      });
    }

    await run(
      `
      UPDATE appointments
      SET
        status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [id]
    );

    res.json({
      message: "Appointment cancelled successfully."
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to cancel appointment."
    });
  }
});

/*
  RESCHEDULE APPOINTMENT
*/
app.patch("/api/appointments/:id/reschedule", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const {
      appointment_date,
      start_time
    } = req.body;

    if (
      !appointment_date ||
      !start_time ||
      !isValidDateString(appointment_date) ||
      !isValidTimeString(start_time)
    ) {
      return res.status(400).json({
        error: "Valid date and time are required."
      });
    }

    const appointment = await get(
      `
      SELECT *
      FROM appointments
      WHERE id = ?
      `,
      [id]
    );

    if (!appointment) {
      return res.status(404).json({
        error: "Appointment not found."
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        error: "Cancelled appointments cannot be rescheduled."
      });
    }

    const providerId = appointment.provider_id;

    const weekday = getWeekday(appointment_date);

    const availability = await get(
      `
      SELECT *
      FROM availability
      WHERE provider_id = ?
      AND weekday = ?
      `,
      [providerId, weekday]
    );

    if (!availability) {
      return res.status(409).json({
        error: "Provider is not available on this day."
      });
    }

    const startMinutes = timeToMinutes(start_time);
    const endMinutes = startMinutes + 30;

    if (
      startMinutes < timeToMinutes(availability.start_time) ||
      endMinutes > timeToMinutes(availability.end_time)
    ) {
      return res.status(409).json({
        error: "Selected time is outside provider availability."
      });
    }

    const endTime = minutesToTime(endMinutes);

    try {
      await run(
        `
        UPDATE appointments
        SET
          appointment_date = ?,
          start_time = ?,
          end_time = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [
          appointment_date,
          start_time,
          endTime,
          id
        ]
      );

      const updated = await get(
        `
        SELECT
          a.*,
          p.name AS provider_name,
          p.specialty,
          p.timezone
        FROM appointments a
        JOIN providers p
          ON a.provider_id = p.id
        WHERE a.id = ?
        `,
        [id]
      );

      res.json({
        message: "Appointment rescheduled successfully.",
        appointment: updated
      });
    } catch (error) {
      if (
        error.code === "SQLITE_CONSTRAINT" ||
        error.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return res.status(409).json({
          error:
            "The selected rescheduling slot is already booked."
        });
      }

      throw error;
    }
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to reschedule appointment."
    });
  }
});

/*
  HEALTH CHECK
*/
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Appointment Booking System"
  });
});

/*
  SPA FALLBACK
*/
app.get("*splat", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `Appointment Booking System running on port ${PORT}`
      );
    });
  })
  .catch(error => {
    console.error(
      "Database initialization failed:",
      error
    );
    process.exit(1);
  });