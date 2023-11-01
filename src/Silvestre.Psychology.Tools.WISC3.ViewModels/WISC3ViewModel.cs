using Microsoft.Extensions.Localization;
using Silvestre.Psychology.Tools.WISC3.Calculator;
using Silvestre.Psychology.Tools.WISC3.ViewModels.Charts;
using System;
using System.Linq;

namespace Silvestre.Psychology.Tools.WISC3.ViewModels
{
    public class WISC3ViewModel
    {
        private readonly WISC3CalculatedQIViewModel _verbal, _realization, _completeScale, _verbalComprehension, _perceptiveOrganization, _processingVelocity;
        private readonly IStringLocalizer _localizationServices;
        private readonly ITestStandardizer _standardizer;
        private readonly IQICalculator _calculator;
        private Age? subjectAge;

        public const string CATEGORY_VERBAL = "Verbal", CATEGORY_REALIZATION = "Realization";
        public const string TEST_IMAGECOMPLETION = "ImageCompletion";
        public const string TEST_INFORMATION = "Information";
        public const string TEST_CODE = "Code";
        public const string TEST_SIMILARITIES = "Similarities";
        public const string TEST_IMAGEDISPOSITION = "ImageDisposition";
        public const string TEST_ARITHMETIC = "Arithmetic";
        public const string TEST_CUBES = "Cubes";
        public const string TEST_VOCABULARY = "Vocabulary";
        public const string TEST_OBJECTCOMPOSITION = "ObjectComposition";
        public const string TEST_COMPREHENSION = "Comprehension";
        public const string TEST_SYMBOLSEARCH = "SymbolSearch";
        public const string TEST_DIGITMEMORY = "DigitMemory";
        public const string TEST_LABYRINTH = "Labyrinth";
        public const string QI_VERBAL = "Verbal";
        public const string QI_REALIZATION = "Realization";
        public const string QI_COMPLETESCALE = "CompleteScale";
        public const string QI_VERBALCOMPREHENSION = "VerbalComprehension";
        public const string QI_PERCEPTIVEORGANIZATION = "PerceptiveOrganization";
        public const string QI_PROCESSINGVELOCITY = "ProcessingVelocity";

        public WISC3ViewModel(IStringLocalizer localizationServices, string country)
        {
            _localizationServices = localizationServices;
            Country = country;
            _standardizer = WISC3Test.Standerdization(country);
            _calculator = WISC3Test.QICalculator(country);

            StanderdizationPhase = new WISC3StanderdizationViewModel
            (_standardizer,
                new WISC3TestViewModel(TEST_IMAGECOMPLETION, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.ImageCompletion),
                new WISC3TestViewModel(TEST_INFORMATION, CATEGORY_VERBAL, _standardizer, TestTypeEnum.Information),
                new WISC3TestViewModel(TEST_CODE, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.Code),
                new WISC3TestViewModel(TEST_SIMILARITIES, CATEGORY_VERBAL, _standardizer, TestTypeEnum.Similarities),
                new WISC3TestViewModel(TEST_IMAGEDISPOSITION, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.ImageDisposition),
                new WISC3TestViewModel(TEST_ARITHMETIC, CATEGORY_VERBAL, _standardizer, TestTypeEnum.Arithmetic),
                new WISC3TestViewModel(TEST_CUBES, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.Cubes),
                new WISC3TestViewModel(TEST_VOCABULARY, CATEGORY_VERBAL, _standardizer, TestTypeEnum.Vocabulary),
                new WISC3TestViewModel(TEST_OBJECTCOMPOSITION, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.ObjectComposition),
                new WISC3TestViewModel(TEST_COMPREHENSION, CATEGORY_VERBAL, _standardizer, TestTypeEnum.Comprehension),
                new WISC3TestViewModel(TEST_SYMBOLSEARCH, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.SymbolSearch),
                new WISC3TestViewModel(TEST_DIGITMEMORY, CATEGORY_VERBAL, _standardizer, TestTypeEnum.DigitMemory),
                new WISC3TestViewModel(TEST_LABYRINTH, CATEGORY_REALIZATION, _standardizer, TestTypeEnum.Labyrinth)
            );

            CalculatorPhase = new WISC3CalculatorViewModel
            (
                _verbal = new WISC3CalculatedQIViewModel(QI_VERBAL, standardResult => _calculator.CalculateVerbalQI(standardResult)),
                _realization = new WISC3CalculatedQIViewModel(QI_REALIZATION, standardResult => _calculator.CalculateRealizationQI(standardResult)),
                _completeScale = new WISC3CalculatedQIViewModel(QI_COMPLETESCALE, standardResult => _calculator.CalculateCompleteScaleQI(standardResult)),
                _verbalComprehension = new WISC3CalculatedQIViewModel(QI_VERBALCOMPREHENSION, standardResult => _calculator.CalculateVerbalComprehensionQI(standardResult)),
                _perceptiveOrganization = new WISC3CalculatedQIViewModel(QI_PERCEPTIVEORGANIZATION, standardResult => _calculator.CalculatePerceptiveOrganizationQI(standardResult)),
                _processingVelocity = new WISC3CalculatedQIViewModel(QI_PROCESSINGVELOCITY, standardResult => _calculator.CalculateProcessingVelocityQI(standardResult))
            );

            StanderdizationPhase.OnStandardResultsUpdated += UpdateCalculatorResults; //Internals first, before notifying external entities
            StanderdizationPhase.OnStandardResultsUpdated += (sender, args) => OnStandardResultsUpdated?.Invoke(this, args);
        }

        public string Country { get; }

        public Age? SubjectAge
        {
            get => subjectAge;
            set
            {
                subjectAge = value;
                OnSubjectAgeUpdated();
            }
        }

        public bool? IsAgeSupported
        {
            get
            {
                if (SubjectAge == null) return null;

                return WISC3Test.IsAgeSupported(Country, SubjectAge.Value);
            }
        }

        public WISC3StanderdizationViewModel StanderdizationPhase { get; }

        public WISC3CalculatorViewModel CalculatorPhase { get; }

        public bool ShouldShowCharts { get; private set; }

        public event EventHandler? OnStandardResultsUpdated;

        public WISC3StandardResultsChartViewModel GetStandardResultsChartData()
        {
            return new WISC3StandardResultsChartViewModel(this);
        }

        public WISC3StandardFactorialIndicesChartViewModel GetStandardFactorialIndicesChartData()
        {
            return new WISC3StandardFactorialIndicesChartViewModel(this);
        }

        public WISC3QiIndicesChartViewModel GetQiIndicesChartData()
        {
            return new WISC3QiIndicesChartViewModel(_localizationServices, _verbal, _realization, _completeScale, _verbalComprehension, _perceptiveOrganization, _processingVelocity);
        }

        private void OnSubjectAgeUpdated()
        {
            StanderdizationPhase.SetSubjectAge(SubjectAge);
        }

        private void UpdateCalculatorResults(object sender, EventArgs args)
        {
            if (IsAgeSupported == true && StanderdizationPhase.AllTests.Where(t => t.Mandatory).All(t => t.TestOK))
            {
                _verbal.StandardResult = StanderdizationPhase.VerbalTotal;
                _realization.StandardResult = StanderdizationPhase.RealizationTotal;
                _completeScale.StandardResult = (short)(StanderdizationPhase.VerbalTotal + StanderdizationPhase.RealizationTotal);
                _verbalComprehension.StandardResult = StanderdizationPhase.VerbalComprehensionTotal;
                _perceptiveOrganization.StandardResult = StanderdizationPhase.PerceptiveOrganizationTotal;
                _processingVelocity.StandardResult = StanderdizationPhase.ProcessingVelocityTotal;

                ShouldShowCharts = true;
            }
            else
            {
                _verbal.StandardResult = null;
                _realization.StandardResult = null;
                _completeScale.StandardResult = null;
                _verbalComprehension.StandardResult = null;
                _perceptiveOrganization.StandardResult = null;
                _processingVelocity.StandardResult = null;

                ShouldShowCharts = false;
            }
        }
    }
}
