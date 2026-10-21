import { getAccessToken } from "./credentials";

// firebase-admin–shaped Realtime Database refs over the RTDB REST API.

class DataSnapshot {
  constructor(key, value) {
    this.key = key;
    this._value = value;
  }
  val() {
    return this._value;
  }
  exists() {
    return this._value !== null && this._value !== undefined;
  }
}

class Reference {
  constructor(databaseURL, path) {
    this._base = databaseURL.replace(/\/$/, "");
    this._path = String(path || "").replace(/^\/+|\/+$/g, "");
    this.key = this._path ? this._path.split("/").pop() : null;
  }
  child(path) {
    return new Reference(this._base, `${this._path}/${path}`);
  }
  async _request(method, value) {
    const token = await getAccessToken();
    const encoded = this._path.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${this._base}/${encoded}.json`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Realtime Database ${method} /${this._path} failed (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  }
  async set(value) {
    await this._request("PUT", value);
  }
  async update(values) {
    await this._request("PATCH", values);
  }
  async remove() {
    await this._request("DELETE");
  }
  async once() {
    return new DataSnapshot(this.key, await this._request("GET"));
  }
  get() {
    return this.once("value");
  }
}

export class Database {
  constructor(databaseURL) {
    this._url = databaseURL;
  }
  ref(path = "") {
    return new Reference(this._url, path);
  }
}
