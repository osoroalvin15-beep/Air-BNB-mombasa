# Airbnb Clone - Next.js App

This is a repository for an Airbnb clone built using Next.js, a popular React framework for server-side rendering and static site generation. The app aims to replicate the core functionality and user experience of the Airbnb website, allowing users to search for accommodations, view listing details, make bookings, and manage their bookings.

## Features

- **Accommodation Search**: Users can search for accommodations by specifying location, dates, number of guests, and other filters.
- **Listing Details**: Detailed information about each listing, including photos, description, amenities, pricing, and availability.
- **Booking**: Users can book accommodations by selecting the desired dates and completing the booking process.
- **User Authentication**: Users can sign up, log in, and manage their profile information.
- **Booking Management**: Users can view and manage their bookings, including viewing upcoming and past bookings, cancelling bookings, and leaving reviews.
- **Host Experience**: Users can become hosts and list their accommodations for others to book.
- **Payment Integration**: Integration with a payment gateway to handle secure online payments for bookings.

## Contributing

Contributions to this project are welcome. Here are some ways you can contribute:

    Report issues and bugs by creating GitHub issues.
    Suggest new features or improvements.
    Submit pull requests to fix issues or add new features.

## Acknowledgements

This project is inspired by and built as a clone of the Airbnb website. Special thanks to the Airbnb team for their great work.
## M-Pesa payments

Bookings are paid with M-Pesa Express (STK push) through Safaricom Daraja:

1. The guest picks dates and taps **Reserve**, then enters their Safaricom number.
2. The server works out the price from the listing and sends the prompt to the phone.
3. When the guest enters their PIN, Safaricom calls `/api/pay/callback` and the booking is created.
   If the callback is missed, the booking page asks Safaricom directly (`/api/pay/status`).

Set the `MPESA_*` variables from `.env.example`. Use `MPESA_ENV=sandbox` while testing, and
`production` with your real Paybill/Till once Safaricom approves your Go-Live. The callback URL
must be public https (your Render URL), and it must not contain the word "mpesa".
Payments that arrive but cannot be booked (price mismatch or dates taken) are saved with status
`REVIEW` in the `MpesaPayment` collection.
