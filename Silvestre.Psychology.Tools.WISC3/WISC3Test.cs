using Silvestre.Psychology.Tools.WISC3.Calculator;
using Silvestre.Psychology.Tools.WISC3.Calculator.ConvertionScales.Portugal;
using Silvestre.Psychology.Tools.WISC3.Standardization.Standardizers.Portugal;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Silvestre.Psychology.Tools.WISC3
{
    public static class WISC3Test
    {
        private static readonly IDictionary<string, ITestStandardizer> _Standerdizers = new Dictionary<string, ITestStandardizer>
        {
            { SupportedCountries.Portugal, new PortugalStandardizer() }
        };

        private static readonly IDictionary<string, IQICalculator> _Calculators = new Dictionary<string, IQICalculator>
        {
            { SupportedCountries.Portugal, new PortugalCalculator() }
        };

        public static ITestStandardizer Standerdization(string country)
        {
            if (_Standerdizers.ContainsKey(country) == false) throw new ArgumentOutOfRangeException(nameof(country), country, "Country not supported");

            return _Standerdizers[country];
        }

        public static IQICalculator QICalculator(string country)
        {
            if (_Calculators.ContainsKey(country) == false) throw new ArgumentOutOfRangeException(nameof(country), country, "Country not supported");

            return _Calculators[country];
        }

        public static bool IsCountrySupported(string country)
        {
            return _Standerdizers.ContainsKey(country) && _Calculators.ContainsKey(country);
        }

        public static bool IsAgeSupported(string country, Age subjectAge)
        {
            if (_Standerdizers.ContainsKey(country) == false) throw new ArgumentOutOfRangeException(nameof(country), country, "Country not supported");
            return _Standerdizers[country].SupportedAgeIntervals.Any(ageInterval => ageInterval.From <= subjectAge && ageInterval.To >= subjectAge);
        }
    }
}
