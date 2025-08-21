"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentEvent = getCurrentEvent;
// A simple cultural calendar for India
// This is not exhaustive and is for demonstration purposes only.
// A more robust solution would use a dedicated library or API.
const culturalCalendar = {
    "IN": {
        "01-01": "New Year's Day",
        "01-14": "Makar Sankranti / Pongal",
        "01-26": "Republic Day",
        "03-08": "Holi",
        "04-14": "Ambedkar Jayanti / Vaisakhi",
        "05-01": "Labour Day",
        "08-15": "Independence Day",
        "10-02": "Gandhi Jayanti",
        "10-24": "Dussehra",
        "11-12": "Diwali",
        "12-25": "Christmas",
    },
};
/**
 * Gets the current festival or event for a given locale.
 * @param locale The user's locale.
 * @returns The current festival or event, or null if there is no event today.
 */
function getCurrentEvent(locale) {
    const today = new Date();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const date = `${month}-${day}`;
    const country = locale.split('-')[1];
    if (culturalCalendar[country] && culturalCalendar[country][date]) {
        return culturalCalendar[country][date];
    }
    return null;
}
//# sourceMappingURL=cultural-calendar.js.map