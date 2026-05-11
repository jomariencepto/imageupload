import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://qsfofjpswydzolvpvcya.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZm9manBzd3lkem9sdnB2Y3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjI2MzgsImV4cCI6MjA5Mzk5ODYzOH0.LRnMWdZeW-lS4Xy4pkC-hCbky0v54uRLJJOdA-gOhsM";
const tableName = "image";
const bucketName = "ImageUpload";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const uploadForm = document.querySelector("#uploadForm");
const imageTitleInput = document.querySelector("#imageTitleInput");
const imageInput = document.querySelector("#imageInput");
const fileLabel = document.querySelector("#fileLabel");
const uploadButton = document.querySelector("#uploadButton");
const statusMessage = document.querySelector("#statusMessage");
const galleryGrid = document.querySelector("#galleryGrid");
const dateList = document.querySelector("#dateList");
const seeMoreButton = document.querySelector("#seeMoreButton");
const galleryTitle = document.querySelector("#galleryTitle");
const showRecentButton = document.querySelector("#showRecentButton");
const imageNavButton = document.querySelector("#imageNavButton");
const imageViewer = document.querySelector("#imageViewer");
const viewerImage = document.querySelector("#viewerImage");
const viewerCaption = document.querySelector("#viewerCaption");
const viewerDownloadButton = document.querySelector("#viewerDownloadButton");
const viewerDeleteButton = document.querySelector("#viewerDeleteButton");
const viewerCloseButton = document.querySelector("#viewerCloseButton");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginButton = document.querySelector("#adminLoginButton");
const adminLogoutButton = document.querySelector("#adminLogoutButton");
const adminStatus = document.querySelector("#adminStatus");
const menuToggleButton = document.querySelector("#menuToggleButton");
const sidebarBackdrop = document.querySelector("#sidebarBackdrop");

const recentLimit = 6;
let allImages = [];
let visibleCount = recentLimit;
let selectedDateKey = null;
let currentUser = null;
let isAdmin = false;
let activePreviewImage = null;

imageInput.addEventListener("change", () => {
  const files = Array.from(imageInput.files);

  if (!files.length) {
    fileLabel.textContent = "Choose images";
  } else if (files.length === 1) {
    fileLabel.textContent = files[0].name;
  } else {
    fileLabel.textContent = `${files.length} images selected`;
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    adminLoginButton.disabled = true;
    setStatus("Signing in...");

    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail.value,
      password: adminPassword.value
    });

    if (error) {
      throw error;
    }

    adminLoginForm.reset();
    setStatus("Admin signed in.");
  } catch (error) {
    console.error(error);
    setStatus(`Login failed: ${error.message}`, true);
  } finally {
    adminLoginButton.disabled = false;
  }
});

adminLogoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setStatus("Admin signed out.");
});

menuToggleButton.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("is-menu-open");
  menuToggleButton.setAttribute("aria-expanded", String(isOpen));
  menuToggleButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  sidebarBackdrop.hidden = !isOpen;
});

sidebarBackdrop.addEventListener("click", closeMobileMenu);

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const files = Array.from(imageInput.files);
  const imageTitle = imageTitleInput.value.trim();

  if (!imageTitle) {
    setStatus("Please add an image title first.", true);
    imageTitleInput.focus();
    return;
  }

  if (!files.length) {
    setStatus("Please choose at least one image first.", true);
    return;
  }

  const invalidFile = files.find((file) => !file.type.startsWith("image/"));
  if (invalidFile) {
    setStatus("Only image files are allowed.", true);
    return;
  }

  try {
    uploadButton.disabled = true;
    setStatus(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);

    for (const [index, file] of files.entries()) {
      setStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);

      const uploadedAt = new Date();
      const dateKey = toDateKey(uploadedAt);
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const imagePath = `${dateKey}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(imagePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Storage upload failed for ${file.name}: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(imagePath);

      const { error: insertError } = await supabase
        .from(tableName)
        .insert({
          image_url: publicUrlData.publicUrl,
          image_path: imagePath,
          original_name: files.length === 1 ? imageTitle : `${imageTitle} ${index + 1}`
        });

      if (insertError) {
        throw new Error(`Database insert failed for ${file.name}: ${insertError.message}`);
      }
    }

    uploadForm.reset();
    fileLabel.textContent = "Choose images";
    selectedDateKey = null;
    visibleCount = recentLimit;
    setStatus(`${files.length} image${files.length === 1 ? "" : "s"} uploaded successfully.`);
    await loadImages();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Upload failed. Check your Supabase setup.", true);
  } finally {
    uploadButton.disabled = false;
  }
});

seeMoreButton.addEventListener("click", () => {
  visibleCount += recentLimit;
  renderGallery();
});

showRecentButton.addEventListener("click", () => {
  selectedDateKey = null;
  visibleCount = recentLimit;
  renderAll();
});

imageNavButton.addEventListener("click", () => {
  selectedDateKey = null;
  visibleCount = recentLimit;
  renderAll();
});

viewerCloseButton.addEventListener("click", closeImageViewer);
viewerDeleteButton.addEventListener("click", async () => {
  if (activePreviewImage) {
    await deleteImage(activePreviewImage);
    closeImageViewer();
  }
});

imageViewer.addEventListener("click", (event) => {
  if (event.target === imageViewer) {
    closeImageViewer();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageViewer.hidden) {
    closeImageViewer();
  }

  if (event.key === "Escape" && document.body.classList.contains("is-menu-open")) {
    closeMobileMenu();
  }
});

initAuth();
loadImages();

supabase
  .channel("images-live-updates")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: tableName
    },
    () => {
      loadImages();
    }
  )
  .subscribe();

async function initAuth() {
  const { data } = await supabase.auth.getSession();
  await setAuthState(data.session?.user || null);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    await setAuthState(session?.user || null);
  });
}

async function setAuthState(user) {
  currentUser = user;
  isAdmin = false;

  if (currentUser) {
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.error(error);
    }

    isAdmin = Boolean(data);
  }

  renderAdminState();
  renderGallery();
}

function renderAdminState() {
  adminLoginForm.hidden = Boolean(currentUser);
  adminLogoutButton.hidden = !currentUser;

  if (!currentUser) {
    adminStatus.textContent = "Sign in as an admin to delete uploaded images.";
    return;
  }

  adminStatus.textContent = isAdmin
    ? `Signed in as admin: ${currentUser.email}`
    : `Signed in as ${currentUser.email}, but this account is not an admin.`;
}

async function loadImages() {
  const { data, error } = await supabase
    .from(tableName)
    .select("id, created_at, image_url, image_path, original_name")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    setStatus(`Could not load images: ${error.message}`, true);
    return;
  }

  allImages = data.map((image) => {
    const uploadedAt = new Date(image.created_at);

    return {
      id: image.id,
      imageUrl: image.image_url,
      imagePath: image.image_path,
      originalName: image.original_name,
      uploadedAt,
      dateKey: toDateKey(uploadedAt)
    };
  });

  renderAll();
}

function renderAll() {
  renderDateList();
  renderGallery();
}

function renderDateList() {
  const grouped = groupImagesByDate(allImages);
  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (!dateKeys.length) {
    dateList.innerHTML = '<p class="empty-state">No upload dates yet.</p>';
    return;
  }

  dateList.innerHTML = "";

  dateKeys.forEach((dateKey) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `date-button${selectedDateKey === dateKey ? " is-selected" : ""}`;
    button.innerHTML = `
      <span>${formatDateLabel(dateKey)}</span>
      <span class="date-count">${grouped[dateKey].length}</span>
    `;
    button.addEventListener("click", () => {
      selectedDateKey = dateKey;
      visibleCount = recentLimit;
      renderAll();
      closeMobileMenu();
    });
    dateList.appendChild(button);
  });
}

function closeMobileMenu() {
  document.body.classList.remove("is-menu-open");
  menuToggleButton.setAttribute("aria-expanded", "false");
  menuToggleButton.setAttribute("aria-label", "Open menu");
  sidebarBackdrop.hidden = true;
}

function renderGallery() {
  const imagesToShow = selectedDateKey
    ? allImages.filter((image) => image.dateKey === selectedDateKey)
    : allImages;

  const visibleImages = imagesToShow.slice(0, visibleCount);
  galleryTitle.textContent = selectedDateKey
    ? `Images from ${formatDateLabel(selectedDateKey)}`
    : "Recent Images";

  showRecentButton.hidden = !selectedDateKey;
  seeMoreButton.hidden = visibleCount >= imagesToShow.length;

  if (!visibleImages.length) {
    galleryGrid.innerHTML = '<p class="empty-state">No images found.</p>';
    return;
  }

  galleryGrid.innerHTML = "";
  visibleImages.forEach((image) => {
    const card = document.createElement("article");
    card.className = "image-card";

    card.innerHTML = `
      <p class="image-title">${escapeHtml(image.originalName || "Untitled image")}</p>
      <button class="image-preview-button" type="button" aria-label="View ${escapeHtml(image.originalName || "uploaded image")}">
        <img src="${image.imageUrl}" alt="${escapeHtml(image.originalName || "Uploaded image")}">
      </button>
      <div class="image-meta">
        <p class="image-date">${formatFullDate(image.uploadedAt)}</p>
        <p class="image-time">${formatTime(image.uploadedAt)}</p>
        ${isAdmin ? '<button class="delete-button" type="button">Delete</button>' : ""}
      </div>
    `;

    card
      .querySelector(".image-preview-button")
      .addEventListener("click", () => openImageViewer(image));

    const deleteButton = card.querySelector(".delete-button");
    if (deleteButton) {
      deleteButton.addEventListener("click", () => deleteImage(image));
    }

    galleryGrid.appendChild(card);
  });
}

async function deleteImage(image) {
  if (!isAdmin) {
    setStatus("Only admins can delete images.", true);
    return;
  }

  const confirmed = window.confirm(`Delete ${image.originalName || "this image"}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  try {
    setStatus("Deleting image...");

    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([image.imagePath]);

    if (storageError) {
      throw new Error(`Storage delete failed: ${storageError.message}`);
    }

    const { error: rowError } = await supabase
      .from(tableName)
      .delete()
      .eq("id", image.id);

    if (rowError) {
      throw new Error(`Database delete failed: ${rowError.message}`);
    }

    setStatus("Image deleted.");
    await loadImages();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Delete failed. Check your admin policies.", true);
  }
}

function openImageViewer(image) {
  activePreviewImage = image;
  viewerImage.src = image.imageUrl;
  viewerImage.alt = image.originalName || "Uploaded image";
  viewerCaption.textContent = `${image.originalName || "Uploaded image"} - ${formatFullDate(image.uploadedAt)} at ${formatTime(image.uploadedAt)}`;
  viewerDownloadButton.href = image.imageUrl;
  viewerDownloadButton.download = image.originalName || "uploaded-image";
  viewerDeleteButton.hidden = !isAdmin;
  imageViewer.hidden = false;
  document.body.classList.add("is-viewing-image");
  viewerCloseButton.focus();
}

function closeImageViewer() {
  activePreviewImage = null;
  imageViewer.hidden = true;
  document.body.classList.remove("is-viewing-image");
  viewerImage.src = "";
  viewerImage.alt = "";
  viewerCaption.textContent = "";
  viewerDownloadButton.href = "#";
  viewerDownloadButton.removeAttribute("download");
  viewerDeleteButton.hidden = true;
}

function groupImagesByDate(images) {
  return images.reduce((groups, image) => {
    groups[image.dateKey] = groups[image.dateKey] || [];
    groups[image.dateKey].push(image);
    return groups;
  }, {});
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDateLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
