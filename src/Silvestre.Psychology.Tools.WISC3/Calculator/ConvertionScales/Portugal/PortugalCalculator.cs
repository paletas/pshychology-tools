namespace Silvestre.Psychology.Tools.WISC3.Calculator.ConvertionScales.Portugal
{
    internal class PortugalCalculator : IQICalculator
    {
        private VerbalSubscale _verbalSubscale;
        private RealizationSubscale _realizationSubscale;
        private CompleteSubscale _completeSubscale;
        private VerbalComprehensionSubscale _verbalComprehensionSubscale;
        private PerceptiveOrganizationSubscale _perceptiveOrganizationSubscale;
        private ProcessingVelocitySubscale _velocitySubscale;

        public PortugalCalculator()
        {
            _verbalSubscale = new VerbalSubscale();
            _realizationSubscale = new RealizationSubscale();
            _completeSubscale = new CompleteSubscale();
            _verbalComprehensionSubscale = new VerbalComprehensionSubscale();
            _perceptiveOrganizationSubscale = new PerceptiveOrganizationSubscale();
            _velocitySubscale = new ProcessingVelocitySubscale();
        }

        public CalculatedIndexResult? CalculateCompleteScaleQI(short standardTestResults)
        {
            return GetQIResult(_completeSubscale, standardTestResults);
        }

        public CalculatedIndexResult? CalculatePerceptiveOrganizationQI(short standardTestResults)
        {
            return GetQIResult(_perceptiveOrganizationSubscale, standardTestResults);
        }

        public CalculatedIndexResult? CalculateProcessingVelocityQI(short standardTestResults)
        {
            return GetQIResult(_velocitySubscale, standardTestResults);
        }

        public CalculatedIndexResult? CalculateRealizationQI(short standardTestResults)
        {
            return GetQIResult(_realizationSubscale, standardTestResults);
        }

        public CalculatedIndexResult? CalculateVerbalComprehensionQI(short standardTestResults)
        {
            return GetQIResult(_verbalComprehensionSubscale, standardTestResults);
        }

        public CalculatedIndexResult? CalculateVerbalQI(short standardTestResults)
        {
            return GetQIResult(_verbalSubscale, standardTestResults);
        }

        private CalculatedIndexResult? GetQIResult(IConvertionScale convertionScale, short standardTestResults)
        {
            if (convertionScale.IsResultSupported(standardTestResults))
                return new CalculatedIndexResult(convertionScale.QI(standardTestResults), convertionScale.Percentil(standardTestResults), convertionScale.ConfidenceIntervalBottomBoundary(standardTestResults, ConfidenceIntervalPercentageEnum.Per90), convertionScale.ConfidenceIntervalBottomBoundary(standardTestResults, ConfidenceIntervalPercentageEnum.Per95));
            else
                return null;
        }
    }
}
