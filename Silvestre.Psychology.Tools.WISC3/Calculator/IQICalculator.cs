namespace Silvestre.Psychology.Tools.WISC3.Calculator
{
    public interface IQICalculator
    {
        CalculatedIndexResult? CalculateVerbalQI(short standardTestResults);

        CalculatedIndexResult? CalculateRealizationQI(short standardTestResults);

        CalculatedIndexResult? CalculateCompleteScaleQI(short standardTestResults);

        CalculatedIndexResult? CalculateVerbalComprehensionQI(short standardTestResults);

        CalculatedIndexResult? CalculatePerceptiveOrganizationQI(short standardTestResults);

        CalculatedIndexResult? CalculateProcessingVelocityQI(short standardTestResults);
    }
}
