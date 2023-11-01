using System.Collections.Generic;

namespace Silvestre.Psychology.Tools.WISC3.ViewModels
{
    public class WISC3CalculatorViewModel
    {
        public WISC3CalculatorViewModel(params WISC3CalculatedQIViewModel[] calculatedQI)
        {
            AllCalculatedQI = calculatedQI;
        }

        public IEnumerable<WISC3CalculatedQIViewModel> AllCalculatedQI { get; }
    }
}
