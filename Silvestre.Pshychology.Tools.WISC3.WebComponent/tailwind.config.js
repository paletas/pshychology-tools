module.exports = {
    theme: {
        extend: {}
    },
    variants: {
        extend: {
            border: ['focus-within'],
        }
    },
    plugins: [
        require('@tailwindcss/forms')
    ]
}