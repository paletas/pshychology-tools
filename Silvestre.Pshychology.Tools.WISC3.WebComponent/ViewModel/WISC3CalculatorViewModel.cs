using System.Collections.Generic;

namespace Silvestre.Pshychology.Tools.WISC3.WebComponent.ViewModel
{
    public class WISC3CalculatorViewModel
    {
        public WISC3CalculatorViewModel(params WISC3CalculatedQIViewModel[] calculatedQI)
        {
            this.AllCalculatedQI = calculatedQI;
        }

        public IEnumerable<WISC3CalculatedQIViewModel> AllCalculatedQI { get; }
    }
}
