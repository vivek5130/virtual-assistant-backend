const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

exports.getGeminiRecommendation = async (user) => {
    const prompt = `
    User preferences: ${user.preferences.join(", ")}.
    Purchased products: ${user.purchaseHistory.map(p => p.name).join(", ")}.
    Wishlist: ${user.wishlist.map(p => p.name).join(", ")}.
    Suggest the best product they might love.
    `;

    try {
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        return result.response.text();
    } catch (error) {
        console.error("❌ Gemini API Error:", error);
        return "Sorry, unable to fetch recommendations at the moment.";
    }
};
