let providers = [];
let selectedProvider = null;
let selectedSlot = null;
let rescheduleAppointmentId = null;
let rescheduleSlot = null;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  setMinimumDate();

  await loadProviders();
  await loadAppointments();

  $("appointmentDate").addEventListener(
    "change",
    loadSlots
  );

  $("bookButton").addEventListener(
    "click",
    bookAppointment
  );
});


function setMinimumDate() {
  const today = new Date();

  const year = today.getFullYear();

  const month = String(
    today.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    today.getDate()
  ).padStart(2, "0");

  const date = `${year}-${month}-${day}`;

  $("appointmentDate").min = date;
  $("rescheduleDate").min = date;
}


async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {
      error: "Server returned an invalid response."
    };
  }

  if (!response.ok) {
    throw new Error(
      data.error || "Something went wrong."
    );
  }

  return data;
}


/* PROVIDERS */

async function loadProviders() {
  try {
    providers = await api("/api/providers");

    renderProviders();

    if (providers.length > 0) {
      selectProvider(providers[0].id);
    }
  } catch (error) {
    $("providersContainer").innerHTML =
      `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}


function renderProviders() {
  const container = $("providersContainer");

  if (!providers.length) {
    container.innerHTML =
      `<p class="empty">No providers found.</p>`;

    return;
  }

  container.innerHTML = providers.map(provider => {

    const initials = provider.name
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return `
      <div
        class="provider-card ${
          selectedProvider?.id === provider.id
            ? "selected"
            : ""
        }"
        onclick="selectProvider(${provider.id})"
      >

        <div class="provider-avatar">
          ${escapeHtml(initials)}
        </div>

        <h3>
          ${escapeHtml(provider.name)}
        </h3>

        <p>
          ${escapeHtml(provider.specialty)}
        </p>

        <p>
          Timezone: ${escapeHtml(provider.timezone)}
        </p>

      </div>
    `;
  }).join("");
}


async function selectProvider(providerId) {
  selectedProvider =
    providers.find(
      provider => provider.id === providerId
    );

  selectedSlot = null;

  renderProviders();

  await loadAvailability();

  await loadSlots();
}


/* SLOTS */

async function loadSlots() {
  const date = $("appointmentDate").value;

  if (!selectedProvider || !date) {
    $("slotsContainer").innerHTML =
      `<p class="empty">
        Select a provider and date.
      </p>`;

    return;
  }

  $("slotsContainer").innerHTML =
    `<p class="loading">Loading slots...</p>`;

  try {
    const data = await api(
      `/api/slots?provider_id=${selectedProvider.id}&date=${date}`
    );

    $("timezoneText").textContent =
      data.timezone
        ? data.timezone
        : "";

    renderSlots(data.slots);
  } catch (error) {
    $("slotsContainer").innerHTML =
      `<p class="empty">
        ${escapeHtml(error.message)}
      </p>`;
  }
}


function renderSlots(slots) {
  const container = $("slotsContainer");

  if (!slots.length) {
    container.innerHTML =
      `<p class="empty">
        No slots available for this date.
      </p>`;

    return;
  }

  container.innerHTML = slots.map(slot => {

    if (!slot.available) {
      return `
        <button
          class="slot booked"
          disabled
        >
          ${formatTime(slot.start_time)}
          <br>
          <small>Booked</small>
        </button>
      `;
    }

    return `
      <button
        class="slot ${
          selectedSlot?.start_time === slot.start_time
            ? "selected"
            : ""
        }"
        onclick="selectSlot('${slot.start_time}', '${slot.end_time}')"
      >
        ${formatTime(slot.start_time)}
      </button>
    `;
  }).join("");
}


function selectSlot(startTime, endTime) {
  selectedSlot = {
    start_time: startTime,
    end_time: endTime
  };

  loadSlots();
}


/* BOOKING */

async function bookAppointment() {
  if (!selectedProvider) {
    showToast(
      "Please select a provider.",
      true
    );

    return;
  }

  const date =
    $("appointmentDate").value;

  const name =
    $("clientName").value.trim();

  const email =
    $("clientEmail").value.trim();

  if (!date) {
    showToast(
      "Please select an appointment date.",
      true
    );

    return;
  }

  if (!selectedSlot) {
    showToast(
      "Please select an available time slot.",
      true
    );

    return;
  }

  if (!name) {
    showToast(
      "Please enter your name.",
      true
    );

    return;
  }

  if (!isValidEmail(email)) {
    showToast(
      "Please enter a valid email address.",
      true
    );

    return;
  }

  const button = $("bookButton");

  button.disabled = true;
  button.textContent = "Booking...";

  try {
    const result = await api(
      "/api/appointments",
      {
        method: "POST",

        body: JSON.stringify({
          provider_id:
            selectedProvider.id,

          client_name: name,

          client_email: email,

          appointment_date: date,

          start_time:
            selectedSlot.start_time
        })
      }
    );

    showConfirmation(
      result.appointment
    );

    $("clientName").value = "";
    $("clientEmail").value = "";

    selectedSlot = null;

    await loadSlots();
    await loadAppointments();

  } catch (error) {
    showToast(
      error.message,
      true
    );

    // Refresh slots because another client
    // may have taken the slot.
    await loadSlots();
  } finally {
    button.disabled = false;
    button.textContent = "Confirm Booking";
  }
}


function showConfirmation(appointment) {
  const card =
    $("confirmationCard");

  const details =
    $("confirmationDetails");

  details.innerHTML = `
    <div class="confirmation-details">

      <p>
        <strong>Provider:</strong>
        ${escapeHtml(appointment.provider_name)}
      </p>

      <p>
        <strong>Specialty:</strong>
        ${escapeHtml(appointment.specialty)}
      </p>

      <p>
        <strong>Date:</strong>
        ${formatDate(appointment.appointment_date)}
      </p>

      <p>
        <strong>Time:</strong>
        ${formatTime(appointment.start_time)}
        -
        ${formatTime(appointment.end_time)}
      </p>

      <p>
        <strong>Client:</strong>
        ${escapeHtml(appointment.client_name)}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(appointment.client_email)}
      </p>

    </div>
  `;

  card.classList.remove("hidden");

  card.scrollIntoView({
    behavior: "smooth"
  });
}


/* AVAILABILITY */

async function loadAvailability() {
  if (!selectedProvider) {
    return;
  }

  const container =
    $("availabilityContainer");

  container.innerHTML =
    `<p class="loading">
      Loading availability...
    </p>`;

  try {
    const data = await api(
      `/api/providers/${selectedProvider.id}/availability`
    );

    renderAvailability(
      data.availability
    );
  } catch (error) {
    container.innerHTML =
      `<p class="empty">
        ${escapeHtml(error.message)}
      </p>`;
  }
}


function renderAvailability(availability) {
  const container =
    $("availabilityContainer");

  container.innerHTML =
    DAYS.map((day, weekday) => {

      const existing =
        availability.find(
          item => item.weekday === weekday
        );

      return `
        <div class="availability-item">

          <h3>${day}</h3>

          <div class="availability-times">

            <input
              type="time"
              id="start-${weekday}"
              value="${
                existing
                  ? existing.start_time
                  : "09:00"
              }"
            >

            <input
              type="time"
              id="end-${weekday}"
              value="${
                existing
                  ? existing.end_time
                  : "17:00"
              }"
            >

          </div>

          <button
            class="secondary-button availability-save"
            onclick="saveAvailability(${weekday})"
          >
            Save ${day}
          </button>

        </div>
      `;
    }).join("");
}


async function saveAvailability(weekday) {
  const startTime =
    $(`start-${weekday}`).value;

  const endTime =
    $(`end-${weekday}`).value;

  try {
    await api(
      `/api/providers/${selectedProvider.id}/availability`,
      {
        method: "PUT",

        body: JSON.stringify({
          weekday,
          start_time: startTime,
          end_time: endTime
        })
      }
    );

    showToast(
      `${DAYS[weekday]} availability saved.`
    );

    await loadSlots();

  } catch (error) {
    showToast(
      error.message,
      true
    );
  }
}


/* APPOINTMENTS */

async function loadAppointments() {
  const container =
    $("appointmentsContainer");

  container.innerHTML =
    `<p class="loading">
      Loading appointments...
    </p>`;

  try {
    const appointments =
      await api("/api/appointments");

    renderAppointments(
      appointments
    );
  } catch (error) {
    container.innerHTML =
      `<p class="empty">
        ${escapeHtml(error.message)}
      </p>`;
  }
}


function renderAppointments(appointments) {
  const container =
    $("appointmentsContainer");

  if (!appointments.length) {
    container.innerHTML =
      `<p class="empty">
        No appointments yet.
      </p>`;

    return;
  }

  container.innerHTML =
    appointments.map(appointment => {

      return `
        <div class="appointment-item">

          <div class="appointment-main">

            <span
              class="status ${
                appointment.status
              }"
            >
              ${appointment.status === "booked"
                ? "Confirmed"
                : "Cancelled"}
            </span>

            <h3>
              ${escapeHtml(
                appointment.client_name
              )}
            </h3>

            <p>
              <strong>Provider:</strong>
              ${escapeHtml(
                appointment.provider_name
              )}
            </p>

            <p>
              <strong>Date:</strong>
              ${formatDate(
                appointment.appointment_date
              )}
            </p>

            <p>
              <strong>Time:</strong>
              ${formatTime(
                appointment.start_time
              )}
              -
              ${formatTime(
                appointment.end_time
              )}
            </p>

            <p>
              <strong>Email:</strong>
              ${escapeHtml(
                appointment.client_email
              )}
            </p>

          </div>

          ${
            appointment.status === "booked"
              ? `
                <div class="appointment-actions">

                  <button
                    class="secondary-button"
                    onclick="openRescheduleModal(
                      ${appointment.id},
                      ${appointment.provider_id}
                    )"
                  >
                    Reschedule
                  </button>

                  <button
                    class="danger-button"
                    onclick="cancelAppointment(
                      ${appointment.id}
                    )"
                  >
                    Cancel
                  </button>

                </div>
              `
              : ""
          }

        </div>
      `;
    }).join("");
}


/* CANCEL */

async function cancelAppointment(id) {
  const confirmed =
    confirm(
      "Are you sure you want to cancel this appointment?"
    );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/appointments/${id}/cancel`,
      {
        method: "PATCH"
      }
    );

    showToast(
      "Appointment cancelled successfully."
    );

    await loadAppointments();
    await loadSlots();

  } catch (error) {
    showToast(
      error.message,
      true
    );
  }
}


/* RESCHEDULE */

function openRescheduleModal(
  appointmentId,
  providerId
) {
  rescheduleAppointmentId =
    appointmentId;

  rescheduleSlot = null;

  selectedProvider =
    providers.find(
      provider => provider.id === providerId
    );

  $("rescheduleDate").value = "";

  $("rescheduleSlots").innerHTML =
    `<p class="empty">
      Select a new date.
    </p>`;

  $("rescheduleModal")
    .classList
    .remove("hidden");

  $("rescheduleDate").onchange =
    loadRescheduleSlots;

  $("rescheduleButton").onclick =
    confirmReschedule;
}


function closeRescheduleModal() {
  $("rescheduleModal")
    .classList
    .add("hidden");

  rescheduleAppointmentId = null;
  rescheduleSlot = null;
}


async function loadRescheduleSlots() {
  const date =
    $("rescheduleDate").value;

  if (!date || !selectedProvider) {
    return;
  }

  const container =
    $("rescheduleSlots");

  container.innerHTML =
    `<p class="loading">
      Loading slots...
    </p>`;

  try {
    const data = await api(
      `/api/slots?provider_id=${selectedProvider.id}&date=${date}`
    );

    const available =
      data.slots.filter(
        slot => slot.available
      );

    if (!available.length) {
      container.innerHTML =
        `<p class="empty">
          No available slots.
        </p>`;

      return;
    }

    container.innerHTML =
      available.map(slot => `
        <button
          class="slot ${
            rescheduleSlot?.start_time ===
            slot.start_time
              ? "selected"
              : ""
          }"
          onclick="selectRescheduleSlot(
            '${slot.start_time}',
            '${slot.end_time}'
          )"
        >
          ${formatTime(slot.start_time)}
        </button>
      `).join("");

  } catch (error) {
    container.innerHTML =
      `<p class="empty">
        ${escapeHtml(error.message)}
      </p>`;
  }
}


function selectRescheduleSlot(
  startTime,
  endTime
) {
  rescheduleSlot = {
    start_time: startTime,
    end_time: endTime
  };

  loadRescheduleSlots();
}


async function confirmReschedule() {
  const date =
    $("rescheduleDate").value;

  if (!date || !rescheduleSlot) {
    showToast(
      "Select a date and time slot.",
      true
    );

    return;
  }

  const button =
    $("rescheduleButton");

  button.disabled = true;
  button.textContent =
    "Rescheduling...";

  try {
    await api(
      `/api/appointments/${rescheduleAppointmentId}/reschedule`,
      {
        method: "PATCH",

        body: JSON.stringify({
          appointment_date: date,

          start_time:
            rescheduleSlot.start_time
        })
      }
    );

    showToast(
      "Appointment rescheduled successfully."
    );

    closeRescheduleModal();

    await loadAppointments();
    await loadSlots();

  } catch (error) {
    showToast(
      error.message,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent =
      "Confirm Reschedule";
  }
}


/* HELPERS */

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];


function formatTime(time) {
  if (!time) return "";

  const [hours, minutes] =
    time.split(":").map(Number);

  const suffix =
    hours >= 12 ? "PM" : "AM";

  const displayHour =
    hours % 12 || 12;

  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}


function formatDate(dateString) {
  if (!dateString) return "";

  const [year, month, day] =
    dateString.split("-");

  return `${day}/${month}/${year}`;
}


function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function showToast(message, isError = false) {
  const toast = $("toast");

  toast.textContent = message;

  toast.className =
    `toast show ${isError ? "error" : ""}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 3500);
}