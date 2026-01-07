import axios from "axios";

async function sampleCartoCiudad() {
  const address = "Calle Alcala, 1, Madrid";
  // Trying the standard 'candidates' endpoint first, effectively looking for JSON
  const url = `https://www.cartociudad.es/geocoder/api/geocoder/candidates?q=${encodeURIComponent(address)}&limit=1`;

  console.log(`Querying: ${url}`);

  try {
    const response = await axios.get(url);

    console.log("Response Structure:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error fetching data:", error);
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", error.response?.data);
    }
  }
}

sampleCartoCiudad();
